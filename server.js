const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// --- CONFIGURATION ---
app.set('json spaces', 2);
app.set('trust proxy', 1);
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
    validate: { trustProxy: false },
    message: { error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

// This must come BEFORE the /:domain wildcard route
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'terms.html'));
});

// --- API LOGIC ---
app.get('/api/lookup/:domain', async (req, res) => {
    const domain = req.params.domain;

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

        res.json(data);

    } catch (error) {
        res.status(500).json({ error: "Lookup failed or domain not found" });
    }
});

// --- CLI ROUTE (Curl) ---
app.get('/:domain', async (req, res, next) => {
    if (!req.params.domain.includes('.')) return next();

    const ua = req.headers['user-agent'];

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
            output += `TXT Records : ${getStr(txt).flat().length} found (use /json to view)\n`;
            output += `------------------------------------------------\n`;

            return res.send(output);
        } catch (e) {
            return res.send(`Error resolving ${domain}\n`);
        }
    }
    next();
});

// --- ROOT & FALLBACK ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 DNS Service running on ${PORT}`));
