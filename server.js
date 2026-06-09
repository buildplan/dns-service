const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { LRUCache } = require('lru-cache');

// Upstream Resolvers
dns.setServers(['1.1.1.1', "9.9.9.9", "208.67.222.222", "8.8.8.8"]);

const app = express();

// --- CONFIGURATION ---
app.set('json spaces', 2); // Pretty print JSON by default

// Set trust proxy count via environment variable, defaulting to 1
const trustProxyCount = process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) : 1;
app.set('trust proxy', trustProxyCount);

app.disable('x-powered-by');
app.use(cors());

// Configure LRU Cache for DNS lookups
const dnsCache = new LRUCache({
    max: 5000,           // Store up to 5000 domain responses
    ttl: 1000 * 60 * 1,  // 1 minute TTL
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'views'), { index: false }));

// --- HELPERS ---
const escapeHtml = (unsafe) => {
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const isValidDomain = (d) => {
    if (!d || d.length > 253) return false;
    return /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(?:\.[a-zA-Z0-9-]{1,63})+$/.test(d);
};

function isCli(userAgent) {
    const ua = (userAgent || '').toLowerCase();
    return ua.includes('curl') || ua.includes('wget') || ua.includes('httpie') ||
        ua.includes('python') || ua.includes('powershell') || ua.includes('aiohttp') || ua.includes('go-http-client');
}

// Timeout Wrapper for DNS Calls
const withTimeout = (promise, ms = 3000) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
    });
    return Promise.race([promise, timeoutPromise])
        .finally(() => clearTimeout(timeoutId));
};

// --- RATE LIMITER ---
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: { error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

// --- ROUTES ---

app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'views', 'terms.html')));

// 2. API Endpoint (JSON)
app.get('/api/lookup/:domain', async (req, res) => {
    // Sanitize immediately
    const domain = (req.params.domain || '').trim().toLowerCase();
    const ua = req.headers['user-agent'];

    if (!isValidDomain(domain)) {
        return res.status(400).json({ error: "Invalid domain format." });
    }

    try {
        const cacheKey = `api_${domain}`;
        if (dnsCache.has(cacheKey)) {
            const cachedData = dnsCache.get(cacheKey);
            if (isCli(ua)) {
                res.header('Content-Type', 'application/json');
                return res.send(JSON.stringify(cachedData, null, 2) + '\n');
            }
            return res.json(cachedData);
        }

        const start = Date.now();

        // Run lookups in parallel
        const [a, aaaa, mx, txt, ns, soa, cname, caa] = await Promise.allSettled([
            withTimeout(dns.resolve4(domain)),
            withTimeout(dns.resolve6(domain)),
            withTimeout(dns.resolveMx(domain)),
            withTimeout(dns.resolveTxt(domain)),
            withTimeout(dns.resolveNs(domain)),
            withTimeout(dns.resolveSoa(domain)),
            withTimeout(dns.resolveCname(domain)),
            withTimeout(dns.resolveCaa(domain))
        ]);

        const getVal = (result) => result.status === 'fulfilled' ? result.value : [];
        const getSingle = (result) => result.status === 'fulfilled' ? (Array.isArray(result.value) ? result.value[0] : result.value) : null;

        const data = {
            domain: domain,
            timestamp: new Date().toISOString(),
            latency_ms: Date.now() - start,
            records: {
                A: getVal(a),
                AAAA: getVal(aaaa),
                MX: getVal(mx),
                TXT: getVal(txt).flat(),
                NS: getVal(ns),
                SOA: getVal(soa) || null,
                CNAME: getSingle(cname),
                CAA: getVal(caa)
            }
        };

        // Save to cache
        dnsCache.set(cacheKey, data);

        // If CLI, send stringified JSON
        if (isCli(ua)) {
            res.header('Content-Type', 'application/json');
            return res.send(JSON.stringify(data, null, 2) + '\n');
        }

        // Otherwise standard JSON (Browsers handle this fine)
        res.json(data);

    } catch (error) {
        // Handle errors for CLI
        const errData = { error: "Lookup failed or domain not found" };
        if (isCli(ua)) {
            res.status(500).header('Content-Type', 'application/json');
            return res.send(JSON.stringify(errData, null, 2) + '\n');
        }
        res.status(500).json(errData);
    }
});

// 3. CLI Text Report
app.get('/:domain', async (req, res, next) => {
    if (!req.params.domain.includes('.')) return next();

    const ua = req.headers['user-agent'];
    if (isCli(ua)) {
        const domain = req.params.domain.trim().toLowerCase();
        const safeDomain = escapeHtml(domain);
        try {
            const cacheKey = `cli_${domain}`;
            if (dnsCache.has(cacheKey)) {
                return res.send(dnsCache.get(cacheKey));
            }

            const [a, mx, ns, txt] = await Promise.allSettled([
                withTimeout(dns.resolve4(domain)),
                withTimeout(dns.resolveMx(domain)),
                withTimeout(dns.resolveNs(domain)),
                withTimeout(dns.resolveTxt(domain))
            ]);

            const getStr = (r) => r.status === 'fulfilled' ? r.value : [];

            let output = `\n🔎 DNS Report: ${safeDomain}\n`;
            output += `------------------------------------------------\n`;
            output += `A Records   : ${getStr(a).join(', ') || '-'}\n`;
            output += `MX Records  : ${getStr(mx).map(m => `${m.exchange} (${m.priority})`).join(', ') || '-'}\n`;
            output += `Nameservers : ${getStr(ns).join(', ') || '-'}\n`;
            output += `TXT Records : ${getStr(txt).flat().length} found (use /api/lookup/${safeDomain} for full list)\n`;
            output += `------------------------------------------------\n`;

            dnsCache.set(cacheKey, output);
            return res.send(output);
        } catch (e) {
            return res.send(`Error resolving ${safeDomain}\n`);
        }
    }
    next();
});

// 4. Root & Fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Use the environment variable PORT, or default to 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 DNS Service running on ${PORT}`));
