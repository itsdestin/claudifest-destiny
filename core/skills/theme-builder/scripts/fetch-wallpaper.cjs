#!/usr/bin/env node
/**
 * fetch-wallpaper.cjs — Robust wallpaper fetcher for /theme-builder.
 *
 * Handles the two annoying failure modes that waste tool calls:
 *   1. CDN hot-link protection (returns a 19KB placeholder unless Referer
 *      and User-Agent headers match the originating site).
 *   2. Wallpaper-gallery pages that don't return a direct image — the real
 *      URL is inside an og:image meta tag, a source/img tag, or a data-src.
 *
 * Usage:
 *   node fetch-wallpaper.cjs <url> <out-path>
 *
 * Behavior:
 *   - If <url> looks like a direct image (.jpg/.png/.webp/.jpeg path), download
 *     it with a browser-like UA and a Referer inferred from the URL's origin.
 *   - If <url> is an HTML page, fetch it, extract og:image (or first reasonable
 *     <img src>), then recursively fetch the extracted image URL.
 *   - Retries once with a different UA if the first attempt returns <100KB
 *     (common hot-link placeholder signature).
 *
 * Prints a JSON line on success:
 *   {"ok":true,"path":"<out-path>","bytes":N,"source":"<final-url>"}
 * Or on failure:
 *   {"ok":false,"error":"<message>"}
 * Exits 0 on success, 1 on failure.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const { URL } = require('url');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

function fetchBuffer(urlStr, { referer, userAgent, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'http:' ? http : https;
    const opts = {
      method: 'GET',
      headers: {
        'User-Agent': userAgent || UAS[0],
        Accept: 'image/avif,image/webp,image/apng,image/*,text/html,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    if (referer) opts.headers.Referer = referer;

    const req = mod.request(u, opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        const nextUrl = new URL(res.headers.location, urlStr).toString();
        res.resume();
        resolve(fetchBuffer(nextUrl, { referer, userAgent, maxRedirects: maxRedirects - 1 }));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        buf: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || '',
        finalUrl: urlStr,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function extractImageUrl(html, pageUrl) {
  // og:image wins — it's what the page owner designated as the hero
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og) return new URL(og[1], pageUrl).toString();

  // Twitter card
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw) return new URL(tw[1], pageUrl).toString();

  // Largest <img> in the page (crude: first <img> with a jpg/png/webp src)
  const img = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
  if (img) return new URL(img[1], pageUrl).toString();

  return null;
}

function looksLikeImage(buf, contentType) {
  if (contentType && /^image\//.test(contentType)) return true;
  // PNG magic
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG magic
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // WebP
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return true;
  return false;
}

/** Read width/height from the start of an image buffer.
 *  Supports PNG, JPEG (SOF0/2), WebP (VP8 / VP8L / VP8X). Returns
 *  { width, height, format } or null if the format isn't recognized.
 *  Zero dependencies — enough header-walking to get dimensions without
 *  pulling in sharp/image-size. */
function readImageDimensions(buf) {
  if (buf.length < 24) return null;

  // PNG — IHDR is the first chunk after the 8-byte signature.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      format: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG — walk segments until we hit an SOF (Start Of Frame) marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      // SOF0..SOF15 except DHT (0xC4), JPG (0xC8), DAC (0xCC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          format: 'jpeg',
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      // Standalone markers (no length field): RST0–RST7 and SOI/EOI
      if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { i += 2; continue; }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
    return null;
  }

  // WebP — "RIFF" + 4 bytes + "WEBP" + chunk header.
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const chunk = buf.slice(12, 16).toString();
    if (chunk === 'VP8 ') {
      // Lossy VP8 — width/height at offset 26, 14 bits each, little-endian.
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      return { format: 'webp', width: w, height: h };
    }
    if (chunk === 'VP8L') {
      // Lossless VP8L — 14-bit dims at offset 21.
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return {
        format: 'webp',
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (chunk === 'VP8X') {
      // Extended — 24-bit dims at offset 24.
      return {
        format: 'webp',
        width: 1 + ((buf[24] | (buf[25] << 8) | (buf[26] << 16)) & 0xffffff),
        height: 1 + ((buf[27] | (buf[28] << 8) | (buf[29] << 16)) & 0xffffff),
      };
    }
    return null;
  }

  return null;
}

// 1080p rule — wallpapers must be at least full HD in either orientation.
// min-side covers landscape AND portrait sources without over-specifying.
const MIN_LONG_SIDE = 1920;
const MIN_SHORT_SIDE = 1080;
function meetsResolutionRule(dims) {
  if (!dims) return false;
  const longSide = Math.max(dims.width, dims.height);
  const shortSide = Math.min(dims.width, dims.height);
  return longSide >= MIN_LONG_SIDE && shortSide >= MIN_SHORT_SIDE;
}

function isDirectImagePath(urlStr) {
  try {
    const p = new URL(urlStr).pathname.toLowerCase();
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(p);
  } catch { return false; }
}

async function main() {
  const [, , url, outPath] = process.argv;
  if (!url || !outPath) {
    console.error('Usage: node fetch-wallpaper.cjs <url> <out-path>');
    process.exit(2);
  }

  const referer = new URL(url).origin + '/';

  try {
    let result;
    let imageUrl = url;

    if (!isDirectImagePath(url)) {
      // Fetch the page, extract an image URL
      const page = await fetchBuffer(url, { referer });
      const html = page.buf.toString('utf-8');
      const extracted = extractImageUrl(html, url);
      if (!extracted) throw new Error('No og:image or <img> found on the page');
      imageUrl = extracted;
    }

    // First attempt with UA #1
    result = await fetchBuffer(imageUrl, { referer, userAgent: UAS[0] });

    // Retry with a different UA if the response is suspiciously small
    // (common hot-link placeholder ~ 10-25KB) AND it still parses as an image.
    if (result.buf.length < 100 * 1024 && looksLikeImage(result.buf, result.contentType)) {
      try {
        const retry = await fetchBuffer(imageUrl, { referer, userAgent: UAS[1] });
        if (retry.buf.length > result.buf.length) result = retry;
      } catch { /* keep the first result */ }
    }

    if (!looksLikeImage(result.buf, result.contentType)) {
      throw new Error(`Downloaded content is not an image (content-type=${result.contentType}, ${result.buf.length} bytes)`);
    }

    // 1080p rule — reject sub-HD wallpapers so Claude retries with a
    // better source instead of shipping a blurry hero image. Dimensions
    // read from the image header (no dependency on external libraries).
    const dims = readImageDimensions(result.buf);
    if (!meetsResolutionRule(dims)) {
      const got = dims ? `${dims.width}×${dims.height} ${dims.format}` : 'unknown dimensions';
      console.log(JSON.stringify({
        ok: false,
        error: `Below 1080p rule — got ${got}, need longest side ≥ ${MIN_LONG_SIDE} and shortest ≥ ${MIN_SHORT_SIDE}`,
        source: imageUrl,
        width: dims ? dims.width : null,
        height: dims ? dims.height : null,
      }));
      process.exit(1);
    }

    fs.writeFileSync(outPath, result.buf);
    console.log(JSON.stringify({
      ok: true,
      path: outPath,
      bytes: result.buf.length,
      width: dims.width,
      height: dims.height,
      source: imageUrl,
    }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

main();
