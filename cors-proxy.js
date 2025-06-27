const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

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

// Proxy endpoint: /proxy?url=https://example.com
app.use('/proxy', (req, res, next) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    selfHandleResponse: false, // Let proxy handle streaming
    pathRewrite: { '^/proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
      // Forward Range header for video streaming
      if (req.headers['range']) {
        proxyReq.setHeader('Range', req.headers['range']);
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
