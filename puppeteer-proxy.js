// Redeploy trigger: June 28, 2025
// Puppeteer-based proxy to extract and stream protected video links
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// Endpoint: /extract?url=PLAYER_PAGE_URL
app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Try to find the .m3u8 URL in the page (works for hls.js and many players)
    const m3u8Url = await page.evaluate(() => {
      // Look for <video src> or hls.js source
      const video = document.querySelector('video');
      if (video && video.src && video.src.endsWith('.m3u8')) return video.src;
      // Look for hls.js loadSource
      if (window.hls && window.hls.url) return window.hls.url;
      // Try to find in scripts
      const scripts = Array.from(document.scripts).map(s => s.textContent);
      for (const script of scripts) {
        const match = script && script.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
        if (match) return match[1];
      }
      return null;
    });
    if (!m3u8Url) {
      await browser.close();
      return res.status(404).json({ error: 'No .m3u8 URL found on page' });
    }
    // Get cookies for the domain
    const cookies = await page.cookies();
    await browser.close();
    res.json({ m3u8Url, cookies });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: 'Puppeteer error', details: err.message });
  }
});

// Endpoint: /stream?url=PLAYER_PAGE_URL
app.get('/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Try to find the .m3u8 URL in the page (works for hls.js and many players)
    const m3u8Url = await page.evaluate(() => {
      // Look for <video src> or hls.js source
      const video = document.querySelector('video');
      if (video && video.src && video.src.endsWith('.m3u8')) return video.src;
      // Look for hls.js loadSource
      if (window.hls && window.hls.url) return window.hls.url;
      // Try to find in scripts
      const scripts = Array.from(document.scripts).map(s => s.textContent);
      for (const script of scripts) {
        const match = script && script.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
        if (match) return match[1];
      }
      return null;
    });
    if (!m3u8Url) {
      await browser.close();
      return res.status(404).json({ error: 'No .m3u8 URL found on page' });
    }
    // Get cookies for the domain
    const cookies = await page.cookies();
    await browser.close();
    // Proxy the .m3u8 playlist
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const client = m3u8Url.startsWith('https') ? https : http;
    client.get(m3u8Url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': url
      }
    }, (proxyRes) => {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ error: 'Proxy error', details: err.message });
    });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: 'Puppeteer error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Puppeteer proxy server running on port ${PORT}`);
});
