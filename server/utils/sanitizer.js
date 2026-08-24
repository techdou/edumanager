/**
 * 上传讲义 HTML 内容安全管道：
 * - scan：统计脚本/事件属性/危险链接/外链域名，生成扫描报告（不修改内容）
 * - sanitize：剥离 <script>、on* 事件属性、javascript:/vbscript:/data:text/html 协议链接
 *
 * 消毒在解压后的 tmpDir 阶段进行（atomicWriteDir 内），失败即中止上传。
 */

function scanHtml(html) {
  const scripts = (html.match(/<script[\s>]/gi) || []).length;
  const eventAttrs = (html.match(/\son[a-z]+\s*=/gi) || []).length;
  const jsUrls = (html.match(/(?:href|src)\s*=\s*["']\s*(?:javascript|vbscript):/gi) || []).length;
  const dataHtmlUrls = (html.match(/(?:href|src)\s*=\s*["']\s*data:text\/html/gi) || []).length;

  const hosts = new Set();
  const urlRe = /(?:href|src)\s*=\s*["']\s*(https?:\/\/([^/"'>\s]+))/gi;
  let m;
  while ((m = urlRe.exec(html)) !== null) {
    hosts.add(m[2].replace(/^www\./, ''));
  }

  return {
    scripts,
    eventAttrs,
    jsUrls,
    dataHtmlUrls,
    externalHosts: [...hosts].sort().slice(0, 50),
    risky: scripts + eventAttrs + jsUrls + dataHtmlUrls
  };
}

// 合并多份扫描报告
function mergeReports(reports) {
  const merged = { files: reports.length, scripts: 0, eventAttrs: 0, jsUrls: 0, dataHtmlUrls: 0, externalHosts: new Set() };
  for (const r of reports) {
    merged.scripts += r.scripts;
    merged.eventAttrs += r.eventAttrs;
    merged.jsUrls += r.jsUrls;
    merged.dataHtmlUrls += r.dataHtmlUrls;
    r.externalHosts.forEach(h => merged.externalHosts.add(h));
  }
  merged.externalHosts = [...merged.externalHosts].sort().slice(0, 50);
  merged.risky = merged.scripts + merged.eventAttrs + merged.jsUrls + merged.dataHtmlUrls;
  return merged;
}

function sanitizeHtml(html) {
  return String(html)
    // 整块剥离 script（含内容），noscript 内容保留
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    // 剥离内联事件属性（onclick=... / onload=... 等，引号三种形态）
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript:/vbscript: 链接与 data:text/html 改为 #
    .replace(/((?:href|src)\s*=\s*["']\s*)(?:javascript|vbscript):[^"']*/gi, '$1#')
    .replace(/((?:href|src)\s*=\s*["']\s*)data:text\/html[^"']*/gi, '$1#');
}

/**
 * 对目录内全部 HTML 执行扫描；sanitize=true 时同时消毒重写文件。
 * 返回合并报告。文件读失败跳过（不影响整体）。
 */
function processLectureHtml(dir, fs, path, { sanitize = false } = {}) {
  const reports = [];
  (function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.x?html?$/i.test(entry.name)) {
        try {
          const html = fs.readFileSync(full, 'utf8');
          reports.push(scanHtml(html));
          if (sanitize) {
            const cleaned = sanitizeHtml(html);
            if (cleaned !== html) {
              fs.writeFileSync(full, cleaned, 'utf8');
            }
          }
        } catch {}
      }
    }
  })(dir);
  return mergeReports(reports);
}

module.exports = { scanHtml, sanitizeHtml, processLectureHtml, mergeReports };
