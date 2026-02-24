// Vercel Serverless Function — CORS прокси для kinogo.limited
// Деплой: vercel deploy
// URL после деплоя: https://your-app.vercel.app/api/proxy?url=...

const https = require('https');
const http = require('http');
const zlib = require('zlib');

const ALLOWED_HOST = 'sk.kinogo.limited';

module.exports = async (req, res) => {
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Параметр url обязателен' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Неверный URL' });
  }

  // Безопасность: разрешаем только kinogo.limited
  if (parsedUrl.hostname !== ALLOWED_HOST) {
    return res.status(403).json({ error: 'Разрешён только ' + ALLOWED_HOST });
  }

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://sk.kinogo.limited/',
    },
    timeout: 15000,
  };

  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  try {
    const data = await new Promise((resolve, reject) => {
      const proxyReq = protocol.request(options, (proxyRes) => {
        const chunks = [];

        let stream = proxyRes;

        const encoding = proxyRes.headers['content-encoding'];
        if (encoding === 'gzip') {
          stream = proxyRes.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = proxyRes.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          stream = proxyRes.pipe(zlib.createBrotliDecompress());
        }

        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Timeout'));
      });

      proxyReq.on('error', reject);
      proxyReq.end();
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(data);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
