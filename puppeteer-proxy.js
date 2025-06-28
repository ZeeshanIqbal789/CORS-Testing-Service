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

// Helper: extract .m3u8 from network requests
async function extractM3U8FromNetwork(page) {
  return new Promise(async (resolve) => {
    let foundUrl = null;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (!foundUrl && req.url().includes('.m3u8')) {
        foundUrl = req.url();
        resolve(foundUrl);
      }
      req.continue();
    });
    // Wait up to 10 seconds for .m3u8
    setTimeout(() => resolve(foundUrl), 10000);
  });
}

// Helper: wait for ms milliseconds
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    // Intercept network for .m3u8
    const m3u8Promise = extractM3U8FromNetwork(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait for video or a few seconds
    await delay(5000);
    let m3u8Url = await m3u8Promise;
    // Fallback: try to extract from DOM/scripts
    if (!m3u8Url) {
      m3u8Url = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.src && video.src.endsWith('.m3u8')) return video.src;
        if (window.hls && window.hls.url) return window.hls.url;
        const scripts = Array.from(document.scripts).map(s => s.textContent);
        for (const script of scripts) {
          const match = script && script.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
          if (match) return match[1];
        }
        return null;
      });
    }
    if (!m3u8Url) {
      await browser.close();
      return res.status(404).json({ error: 'No .m3u8 URL found on page' });
    }
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
    // Intercept network for .m3u8
    const m3u8Promise = extractM3U8FromNetwork(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(5000);
    let m3u8Url = await m3u8Promise;
    if (!m3u8Url) {
      m3u8Url = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.src && video.src.endsWith('.m3u8')) return video.src;
        if (window.hls && window.hls.url) return window.hls.url;
        const scripts = Array.from(document.scripts).map(s => s.textContent);
        for (const script of scripts) {
          const match = script && script.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
          if (match) return match[1];
        }
        return null;
      });
    }
    if (!m3u8Url) {
      await browser.close();
      return res.status(404).json({ error: 'No .m3u8 URL found on page' });
    }
    const cookies = await page.cookies();
    await browser.close();
    // Proxy the .m3u8 playlist and rewrite URLs
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const client = m3u8Url.startsWith('https') ? https : http;
    client.get(m3u8Url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': url
      }
    }, async (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        // Rewrite all URLs in the playlist to go through /stream/segment
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        const encodedCookies = encodeURIComponent(Buffer.from(JSON.stringify(cookies)).toString('base64'));
        const rewritten = data.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
          if (line.startsWith('http')) {
            return `${req.protocol}://${req.get('host')}/stream/segment?segmentUrl=${encodeURIComponent(line)}&cookies=${encodedCookies}`;
          } else if (line && !line.startsWith('#')) {
            // Relative URL
            return `${req.protocol}://${req.get('host')}/stream/segment?segmentUrl=${encodeURIComponent(baseUrl + line)}&cookies=${encodedCookies}`;
          }
          return line;
        });
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
      });
    }).on('error', (err) => {
      res.status(500).json({ error: 'Proxy error', details: err.message });
    });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: 'Puppeteer error', details: err.message });
  }
});

// Endpoint: /stream/segment?segmentUrl=...&cookies=...
app.get('/stream/segment', async (req, res) => {
  const { segmentUrl, cookies } = req.query;
  console.log('Proxying segment:', segmentUrl);
  if (!segmentUrl || !cookies) {
    return res.status(400).json({ error: 'Missing segmentUrl or cookies' });
  }
  let parsedCookies;
  try {
    parsedCookies = JSON.parse(Buffer.from(decodeURIComponent(cookies), 'base64').toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Invalid cookies encoding' });
  }
  const cookieHeader = parsedCookies.map(c => `${c.name}=${c.value}`).join('; ');
  const client = segmentUrl.startsWith('https') ? https : http;
  client.get(segmentUrl, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  }, async (proxyRes) => {
    // If this is a playlist (m3u8), rewrite recursively
    if (segmentUrl.endsWith('.m3u8')) {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        const baseUrl = segmentUrl.substring(0, segmentUrl.lastIndexOf('/') + 1);
        const rewritten = data.replace(/^(?!#)([^\r\n]+)$/gm, (line) => {
          if (line.startsWith('http')) {
            return `${req.protocol}://${req.get('host')}/stream/segment?segmentUrl=${encodeURIComponent(line)}&cookies=${encodeURIComponent(Buffer.from(JSON.stringify(parsedCookies)).toString('base64'))}`;
          } else if (line && !line.startsWith('#')) {
            return `${req.protocol}://${req.get('host')}/stream/segment?segmentUrl=${encodeURIComponent(baseUrl + line)}&cookies=${encodeURIComponent(Buffer.from(JSON.stringify(parsedCookies)).toString('base64'))}`;
          }
          return line;
        });
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
      });
    } else {
      // Forward content-type and length for media chunks
      if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
      if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
      proxyRes.pipe(res);
    }
  }).on('error', (err) => {
    res.status(500).json({ error: 'Segment proxy error', details: err.message });
  });
});

app.listen(PORT, () => {
  console.log(`Puppeteer proxy server running on port ${PORT}`);
});
