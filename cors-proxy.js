const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

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
    pathRewrite: { '^/proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
      // Optionally set headers here
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
