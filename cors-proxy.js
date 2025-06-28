// Redeploy trigger: June 28, 2025
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { URL } = require('url');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const FIXED_REFERER = 'https://tvnation.me/';
const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cookie');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

function rewritePlaylist(playlist, baseUrl, proxyBase) {
  return playlist.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
    if (line.startsWith('http') || line.startsWith('#')) return line;
    let newUrl;
    try {
      newUrl = new URL(line, baseUrl).toString();
    } catch {
      return line;
    }
    return `${proxyBase}?url=${encodeURIComponent(newUrl)}`;
  });
}

app.use('/proxy', (req, res, next) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  console.log('Proxying:', target);
  // Special handling for .m3u8 playlists
  if (target.endsWith('.m3u8')) {
    const http = target.startsWith('https') ? require('https') : require('http');
    const headers = { ...req.headers };
    headers['referer'] = FIXED_REFERER;
    headers['user-agent'] = FIXED_USER_AGENT;
    const agent = target.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    http.get(target, { headers, agent }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        const rewritten = rewritePlaylist(data, target, req.baseUrl + req.path);
        res.header('Content-Type', 'application/vnd.apple.mpegurl');
        res.header('Access-Control-Allow-Origin', '*');
        res.send(rewritten);
      });
      proxyRes.on('error', (err) => {
        console.error('Proxy error (playlist):', err);
        res.status(500).json({ error: 'Proxy error', details: err.message });
      });
    }).on('error', (err) => {
      console.error('Proxy error (playlist):', err);
      res.status(500).json({ error: 'Proxy error', details: err.message });
    });
    return;
  }
  // Special handling for .ts segment files
  if (target.endsWith('.ts')) {
    const http = target.startsWith('https') ? require('https') : require('http');
    const headers = { ...req.headers };
    headers['referer'] = FIXED_REFERER;
    headers['user-agent'] = FIXED_USER_AGENT;
    const agent = target.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    http.get(target, { headers, agent }, (proxyRes) => {
      res.header('Content-Type', 'video/mp2t');
      res.header('Access-Control-Allow-Origin', '*');
      proxyRes.pipe(res);
      proxyRes.on('error', (err) => {
        console.error('Proxy error (segment):', err);
        res.status(500).json({ error: 'Proxy error', details: err.message });
      });
    }).on('error', (err) => {
      console.error('Proxy error (segment):', err);
      res.status(500).json({ error: 'Proxy error', details: err.message });
    });
    return;
  }
  // For all other files, use proxy middleware
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    selfHandleResponse: false,
    pathRewrite: { '^/proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
      // Forward all headers, but set fixed Referer and User-Agent
      Object.entries(req.headers).forEach(([key, value]) => {
        proxyReq.setHeader(key, value);
      });
      proxyReq.setHeader('Referer', FIXED_REFERER);
      proxyReq.setHeader('User-Agent', FIXED_USER_AGENT);
    },
    onProxyRes: (proxyRes, req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cookie');
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    },
    onError: (err, req, res) => {
      console.error('Proxy error (middleware):', err);
      res.status(500).json({ error: 'Proxy error', details: err.message });
    }
  })(req, res, next);
});

app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running. Use /proxy?url=YOUR_URL');
});

app.listen(PORT, () => {
  console.log(`CORS Proxy server running on port ${PORT}`);
});
