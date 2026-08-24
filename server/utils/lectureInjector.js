/**
 * 讲义 HTML 进度跟踪脚本注入（服务端）。
 *
 * 背景：进度/TOC 跟踪原本由前端 Lecture.vue 用 contentDocument 注入，
 * 导致 iframe 必须开 allow-same-origin（与 allow-scripts 组合后沙箱形同虚设，
 * 讲义内嵌脚本可直接读取主站 localStorage 的 token）。
 * 现改为在静态服务时把统一脚本注入 HTML，iframe 即可收紧为仅 allow-scripts。
 *
 * 通信协议（sandboxed iframe origin 为 opaque，序列化为 'null'）：
 * - iframe → parent：postMessage(msg, baseURI 的 origin)，parent 校验 e.origin 为 'null' 或同源
 * - parent → iframe：postMessage(msg, '*')（opaque origin 无法作为 targetOrigin），
 *   iframe 内校验 e.origin === baseURI 的 origin
 */
const fs = require('fs');
const path = require('path');

const PROGRESS_SCRIPT = `
<script>
(function () {
  if (window.__edumanager_viewer) return;
  window.__edumanager_viewer = true;
  var PARENT_ORIGIN = new URL(document.baseURI).origin;
  var headings = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id]');
  var restored = false;

  function sendState() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var active = '';
    for (var i = headings.length - 1; i >= 0; i--) {
      var el = headings[i];
      if (el.getBoundingClientRect().top <= 120) { active = '#' + el.id; break; }
    }
    window.parent.postMessage({ type: 'toc-active', anchor: active }, PARENT_ORIGIN);
    window.parent.postMessage({ type: 'reading-progress', progress: Math.min(100, (scrollTop / maxScroll) * 100) }, PARENT_ORIGIN);
  }

  function restore(progress) {
    if (restored) return;
    restored = true;
    if (!progress || progress <= 0) { sendState(); return; }
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, maxScroll * Math.min(100, progress) / 100);
    setTimeout(sendState, 80);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== PARENT_ORIGIN) return;
    var msg = e.data || {};
    if (msg.type === 'init-progress') restore(msg.progress);
    if (msg.type === 'scroll-to' && msg.anchor) {
      var target;
      try { target = document.querySelector(msg.anchor); } catch (err) {}
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () { sendState(); ticking = false; });
    }
  });

  // 就绪握手：parent 收到 hello 后下发初始进度
  window.parent.postMessage({ type: 'viewer-hello' }, PARENT_ORIGIN);
  setTimeout(function () { if (!restored) { restored = true; sendState(); } }, 300);
})();
</script>`;

// mtime 缓存：注入结果对同一文件版本只算一次
const injectCache = new Map();

function isHtmlFile(filePath) {
  return /\.x?html?$/i.test(filePath);
}

/**
 * 对 HTML 响应注入进度脚本（</body> 前；无 </body> 则追加到末尾）。
 * 非 HTML 或读失败返回 null（调用方回退到 sendFile）。
 */
function serveInjectedHtml(filePath, res) {
  let html;
  const mtime = fs.statSync(filePath).mtimeMs;
  const cached = injectCache.get(filePath);
  if (cached && cached.mtime === mtime) {
    html = cached.html;
  } else {
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch {
      return false;
    }
    if (/<\/script/i.test(html) === false && !html.includes('<body')) {
      // 非 HTML 内容（扩展名碰巧是 .html）——原样返回
    } else if (/<\/body\s*>/i.test(html)) {
      html = html.replace(/<\/body\s*>/i, `${PROGRESS_SCRIPT}</body>`);
    } else {
      html += PROGRESS_SCRIPT;
    }
    if (injectCache.size > 200) injectCache.clear();
    injectCache.set(filePath, { mtime, html });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
  return true;
}

function clearInjectCache() {
  injectCache.clear();
}

module.exports = { serveInjectedHtml, isHtmlFile, clearInjectCache };
