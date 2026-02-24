// Vercel CORS прокси для kinogo.limited
// Поддерживает HTML и изображения

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const ALLOWED_HOST = 'sk.kinogo.limited';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });

    let parsed;
    try { parsed = new URL(targetUrl); }
    catch(e) { return res.status(400).json({ error: 'invalid url' }); }

    if (parsed.hostname !== ALLOWED_HOST)
        return res.status(403).json({ error: 'only ' + ALLOWED_HOST + ' allowed' });

    const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer':         'https://sk.kinogo.limited/',
        },
        timeout: 15000,
    };

    const proto = parsed.protocol === 'https:' ? https : http;

    try {
        const { contentType, buffer } = await new Promise((resolve, reject) => {
            const proxyReq = proto.request(options, (proxyRes) => {
                const ct = proxyRes.headers['content-type'] || 'application/octet-stream';
                const chunks = [];

                const encoding = proxyRes.headers['content-encoding'];
                let stream = proxyRes;

                if      (encoding === 'gzip')    stream = proxyRes.pipe(zlib.createGunzip());
                else if (encoding === 'deflate') stream = proxyRes.pipe(zlib.createInflate());
                else if (encoding === 'br')      stream = proxyRes.pipe(zlib.createBrotliDecompress());

                stream.on('data',  chunk => chunks.push(chunk));
                stream.on('end',   ()    => resolve({ contentType: ct, buffer: Buffer.concat(chunks) }));
                stream.on('error', reject);
            });

            proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('timeout')); });
            proxyReq.on('error', reject);
            proxyReq.end();
        });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).send(buffer);

    } catch(e) {
        console.error('Proxy error:', e.message);
        res.status(500).json({ error: e.message });
    }
};
