const fs = require('fs');
const path = require('path');

// mtime 缓存：讲义 HTML 不变时跳过重复的读盘 + 正则扫描（学生端高频请求路径）
const tocCache = new Map();

/**
 * Extract table of contents from an HTML file.
 * Parses headings (h1-h4) with their IDs and text content.
 * Groups h2-level headings as modules, their children as sections.
 *
 * @param {string} htmlFilePath - Path to the HTML file
 * @returns {{ title: string, modules: Array }}
 */
function extractTOC(htmlFilePath) {
  const mtime = fs.statSync(htmlFilePath).mtimeMs;
  const cached = tocCache.get(htmlFilePath);
  if (cached && cached.mtime === mtime) {
    return cached.toc;
  }

  const html = fs.readFileSync(htmlFilePath, 'utf-8');
  const modules = [];
  let currentModule = null;
  let title = '';

  // Match all headings with id and content
  const headingRegex = /<h([1-4])\s[^>]*id=["']([^"']*)["'][^>]*>(.*?)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const id = match[2];
    // Strip HTML tags from text
    let text = match[3].replace(/<[^>]*>/g, '').trim();
    // Decode common HTML entities
    text = text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    if (level === 1) {
      title = text;
      continue;
    }

    if (level === 2) {
      currentModule = {
        id,
        title: text,
        anchor: `#${id}`,
        sections: [],
      };
      // Extract time range from title, e.g. "模块一：...（09:00 - 09:30）"
      const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[-—]\s*(\d{1,2}:\d{2})/);
      if (timeMatch) {
        currentModule.time = `${timeMatch[1]} - ${timeMatch[2]}`;
      }
      modules.push(currentModule);
    } else if (currentModule) {
      currentModule.sections.push({
        id,
        title: text,
        anchor: `#${id}`,
        level,
      });
    }
  }

  const toc = { title, modules };
  if (tocCache.size > 500) tocCache.clear(); // 讲义重建后旧条目按 mtime 自然失效，超限兜底清空
  tocCache.set(htmlFilePath, { mtime, toc });
  return toc;
}

module.exports = { extractTOC };
