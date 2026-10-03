const fs = require('fs');
const BRIDGE_TAG = '<script src="/content-bridge.js"></script>';
function isHtmlFile(filePath) { return /\.(html?|xhtml)$/i.test(filePath); }
function serveInjectedHtml(filePath, res) {
  if (!isHtmlFile(filePath)) return false;
  let html;
  try { html = fs.readFileSync(filePath, 'utf8'); } catch { return false; }
  html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${BRIDGE_TAG}</body>`) : html + BRIDGE_TAG;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
  return true;
}
// Kept for callers from older versions; responses are never cached here.
function clearInjectCache() {}
module.exports = { serveInjectedHtml, isHtmlFile, clearInjectCache };
