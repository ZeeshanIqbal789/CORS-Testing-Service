// Redeploy trigger: June 27, 2025
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { URL } = require('url');
const stream = require('stream');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Set CORS headers for all responses
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

// Helper to rewrite .m3u8 playlist URLs
function rewritePlaylist(playlist, baseUrl, proxyBase) {
  return playlist.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
    // Ignore comments and empty lines
    if (line.startsWith('http') || line.startsWith('#')) return line;
    // Absolute path
    let newUrl;
    try {
      newUrl = new URL(line, baseUrl).toString();
    } catch {
      return line;
    }
    return `${proxyBase}?url=${encodeURIComponent(newUrl)}`;
  });
}

// Proxy endpoint: /proxy?url=https://example.com
app.use('/proxy', (req, res, next) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  // Special handling for .m3u8 playlists
  if (target.endsWith('.m3u8')) {
    const http = target.startsWith('https') ? require('https') : require('http');
    // Forward User-Agent and Referer headers if present
    const headers = { ...req.headers };
    if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];
    if (req.headers['referer']) headers['referer'] = req.headers['referer'];
    // Use agent to ignore SSL errors
    const agent = target.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    http.get(target, { headers, agent }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        // Rewrite segment URLs
        const rewritten = rewritePlaylist(data, target, req.baseUrl + req.path);
        res.header('Content-Type', 'application/vnd.apple.mpegurl');
        res.header('Access-Control-Allow-Origin', '*');
        res.send(rewritten);
      });
    }).on('error', (err) => {
      res.status(500).json({ error: 'Proxy error', details: err.message });
    });
    return;
  }
  // For all other files (segments, etc), use proxy middleware
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false, // Ignore SSL errors for upstream
    selfHandleResponse: false, // Let proxy handle streaming
    pathRewrite: { '^/proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
      // Forward Range header for video streaming
      if (req.headers['range']) {
        proxyReq.setHeader('Range', req.headers['range']);
      }
      // Forward User-Agent and Referer headers
      if (req.headers['user-agent']) {
        proxyReq.setHeader('User-Agent', req.headers['user-agent']);
      }
      if (req.headers['referer']) {
        proxyReq.setHeader('Referer', req.headers['referer']);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Ensure CORS headers are set on proxied responses
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    },
    onError: (err, req, res) => {
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
