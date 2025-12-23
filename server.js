const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// --- CONFIGURATION ---
app.set('json spaces', 2); // Pretty print JSON by default
app.set('trust proxy', 1); // Security: Trust only the immediate proxy (Nginx)
app.disable('x-powered-by');

// Serve Static Files
app.use(express.static(path.join(__dirname, 'views'), { index: false }));

// --- HELPERS ---
const isValidDomain = (d) => /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(d);

function isCli(userAgent) {
    const ua = (userAgent || '').toLowerCase();
    return ua.includes('curl') || ua.includes('wget') || ua.includes('httpie') ||
           ua.includes('python') || ua.includes('powershell') || ua.includes('aiohttp') || ua.includes('go-http-client');
}

// --- RATE LIMITER ---
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Disable the warning
    message: { error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

// --- ROUTES ---

// 1. Terms Page (Must be before wildcard)
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'terms.html'));
});

// 2. API Endpoint (JSON)
app.get('/api/lookup/:domain', async (req, res) => {
    const domain = req.params.domain;
    const ua = req.headers['user-agent'];

    if (!isValidDomain(domain)) {
        return res.status(400).json({ error: "Invalid domain format." });
    }

    try {
        const start = Date.now();

        // Run lookups in parallel
        const [a, aaaa, mx, txt, ns, soa] = await Promise.allSettled([
            dns.resolve4(domain),
            dns.resolve6(domain),
            dns.resolveMx(domain),
            dns.resolveTxt(domain),
            dns.resolveNs(domain),
            dns.resolveSoa(domain)
        ]);

        const getVal = (result) => result.status === 'fulfilled' ? result.value : [];

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
                SOA: getVal(soa) || null
            }
        };

        // If CLI, send stringified JSON
        if (isCli(ua)) {
            res.header('Content-Type', 'application/json');
            return res.send(JSON.stringify(data, null, 2) + '\n');
        }

        // Otherwise standard JSON (Browsers handle this fine)
        res.json(data);

    } catch (error) {
        // [FIX] Handle errors for CLI nicely too
        const errData = { error: "Lookup failed or domain not found" };
        if (isCli(ua)) {
             res.status(500).header('Content-Type', 'application/json');
             return res.send(JSON.stringify(errData, null, 2) + '\n');
        }
        res.status(500).json(errData);
    }
});

// 3. CLI Text Report (curl dns.wiredalter.com/google.com)
app.get('/:domain', async (req, res, next) => {
    // Skip internal files
    if (!req.params.domain.includes('.')) return next();

    const ua = req.headers['user-agent'];

    // Only intercept CLI tools for the text report
    if (isCli(ua)) {
        const domain = req.params.domain;
        try {
            const [a, mx, ns, txt] = await Promise.allSettled([
                dns.resolve4(domain),
                dns.resolveMx(domain),
                dns.resolveNs(domain),
                dns.resolveTxt(domain)
            ]);

            const getStr = (r) => r.status === 'fulfilled' ? r.value : [];

            let output = `\n🔎 DNS Report: ${domain}\n`;
            output += `------------------------------------------------\n`;
            output += `A Records   : ${getStr(a).join(', ') || '-'}\n`;
            output += `MX Records  : ${getStr(mx).map(m => `${m.exchange} (${m.priority})`).join(', ') || '-'}\n`;
            output += `Nameservers : ${getStr(ns).join(', ') || '-'}\n`;
	    output += `TXT Records : ${getStr(txt).flat().length} found (use /api/lookup/${domain} for full list)\n`;
            output += `------------------------------------------------\n`;

            return res.send(output);
        } catch (e) {
            return res.send(`Error resolving ${domain}\n`);
        }
    }
    next();
});

// 4. Root & Fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 DNS Service running on ${PORT}`));
