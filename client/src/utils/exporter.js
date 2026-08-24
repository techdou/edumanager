/**
 * exporter.js — Markdown / HTML 讲义多格式导出工具
 *
 * 设计思路（借鉴 lengyi-editor 的轻量化理念，代码全部自写）：
 * - PDF：浏览器原生 window.print()，零依赖，原排版保真
 * - PNG 长图：html-to-image（轻量纯 JS）
 * - 纯函数与副作用函数分离，便于单元测试
 *
 * 典型用法：
 *   import { exportNodeToPng, printNode } from '@/utils/exporter'
 *   await exportNodeToPng(articleEl, { filename: '讲义.png', ratio: '9:16' })
 *   await printNode(articleEl, { title: '讲义' })
 */

import { toPng } from 'html-to-image'

/* ============================================================
 * 常量
 * ============================================================ */

/** PNG 长图支持的宽高比（宽:高） */
export const PNG_RATIOS = {
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '1:1': 1,
  '16:9': 16 / 9
}

/** 默认导出参数 */
const DEFAULT_PNG_OPTIONS = {
  filename: '导出',        // 不带扩展名，由内部统一 buildFilename
  ratio: '9:16',
  pixelRatio: 2,          // 2 倍图，保证清晰度
  backgroundColor: '#ffffff',
  timeoutMs: 20000        // toPng 超时保护
}

/** 文件名非法字符（Windows / macOS / Linux 通用） */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/** 文件名主名最大长度（留出扩展名空间） */
const MAX_FILENAME_BASE = 120

/** toPng 默认超时（ms） */
const PNG_TIMEOUT_MS = 20000

/* ============================================================
 * 纯函数（无副作用，可单元测试）
 * ============================================================ */

/**
 * 净化并拼接文件名。
 *
 * @param {string} base  - 文件主名（不含扩展名）
 * @param {string} ext   - 扩展名，不带点（如 'pdf'、'png'）
 * @returns {string} 净化后的完整文件名，如 "讲义1.pdf"
 *
 * 规则：
 * - 替换非法字符 \ / : * ? " < > | 控制字符为下划线
 * - 去除首尾空格和点（Windows 不允许结尾是点）
 * - 空名兜底为 "导出"
 * - 主名超长截断（按 code point，避免切断 emoji 代理对）
 */
export function buildFilename(base, ext) {
  if (typeof base !== 'string') base = String(base ?? '')
  if (typeof ext !== 'string') ext = String(ext ?? '')

  let clean = base.replace(ILLEGAL_FILENAME_CHARS, '_').trim().replace(/\.+$/g, '').trim()
  if (!clean) clean = '导出'
  // 用 Array.from 按 Unicode 码点切片，避免从 emoji 代理对中间切断生成乱码
  if (Array.from(clean).length > MAX_FILENAME_BASE) {
    clean = Array.from(clean).slice(0, MAX_FILENAME_BASE).join('')
  }

  const safeExt = ext.replace(/^[.]+/, '').trim().toLowerCase()
  return safeExt ? `${clean}.${safeExt}` : clean
}

/**
 * 校验传入的是否是可导出的 DOM 元素节点。
 *
 * @param {*} el - 任意值
 * @returns {HTMLElement} 通过校验的元素
 * @throws {TypeError} 非 HTMLElement / null
 */
export function getExportableNode(el) {
  if (el === null || el === undefined) {
    throw new TypeError('导出目标元素为空')
  }
  // 兼容 happy-dom 与浏览器：用 typeof + nodeName 判断，避免依赖 HTMLElement 全局
  if (typeof el !== 'object' || typeof el.nodeName !== 'string' || el.nodeType !== 1) {
    throw new TypeError('导出目标必须是 DOM 元素')
  }
  return el
}

/**
 * 校验导出选项合法性。
 *
 * @param {Object} [opts] - 选项对象
 * @param {string} [opts.ratio] - 宽高比 key，必须在 PNG_RATIOS 中
 * @returns {Object} 规整化后的选项（填充默认值）
 * @throws {Error} ratio 不合法时抛错
 */
export function validateExportOptions(opts = {}) {
  const merged = { ...DEFAULT_PNG_OPTIONS, ...opts }

  if (merged.ratio != null && !(merged.ratio in PNG_RATIOS)) {
    throw new Error(
      `不支持的宽高比 "${merged.ratio}"，可选值：${Object.keys(PNG_RATIOS).join(' / ')}`
    )
  }

  return merged
}

/**
 * 计算按指定宽高比裁剪后的 PNG canvas 尺寸。
 *
 * @param {number} contentHeight - 内容自然高度（px）
 * @param {string} ratio - PNG_RATIOS 的 key
 * @param {number} [baseWidth=720] - 基准宽度（px）
 * @returns {{width:number, height:number}}
 */
export function computeCanvasSize(contentHeight, ratio, baseWidth = 720) {
  const r = PNG_RATIOS[ratio] ?? PNG_RATIOS['9:16']
  return {
    width: baseWidth,
    height: Math.max(Math.round(baseWidth / r), contentHeight)
  }
}

/* ============================================================
 * 副作用函数（浏览器环境）
 * ============================================================ */

/**
 * 触发浏览器下载。
 *
 * @param {string|Blob} source - URL 字符串或 Blob 对象
 * @param {string} filename - 保存的文件名
 */
export function triggerDownload(source, filename) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  // 部分浏览器需要 append 到 DOM 才能触发 click
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 释放 Blob URL（URL 字符串不是 object URL，revokeObjectURL 对它无效，安全调用）
  if (typeof source !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * 把目标 DOM 节点导出为 PNG 长图并下载。
 *
 * ratio 决定最小画布高度（保证社交平台封面比例）；
 * 若内容比该比例更高，按内容实际高度出图（仍是长图）。
 *
 * @param {HTMLElement} node - 要截图的节点
 * @param {Object} [opts]
 * @param {string} [opts.filename='导出'] - 文件主名（不带扩展名，内部统一净化）
 * @param {string} [opts.ratio='9:16'] - 宽高比，见 PNG_RATIOS
 * @param {number} [opts.pixelRatio=2] - 像素倍率
 * @param {number} [opts.timeoutMs=20000] - 超时（ms），超时拒绝并抛错
 * @returns {Promise<void>}
 */
export async function exportNodeToPng(node, opts = {}) {
  const el = getExportableNode(node)
  const options = validateExportOptions(opts)

  // 先按节点自然宽度截图，再用 ratio 决定的最小高度作为 canvasHeight 兜底，
  // 让 html-to-image 在内容不够高时也能产出符合社交平台比例的画布
  const naturalHeight = el.scrollHeight || el.offsetHeight || 0
  const { width: canvasWidth, height: canvasHeight } = computeCanvasSize(naturalHeight, options.ratio)

  const task = toPng(el, {
    pixelRatio: options.pixelRatio,
    backgroundColor: options.backgroundColor,
    canvasWidth,
    canvasHeight,
    cacheBust: true,           // 避免 cross-origin 图片缓存导致 canvas 被污染
    filter: (domNode) => {
      if (domNode.classList && domNode.classList.contains('export-skip')) {
        return false
      }
      return true
    }
  })

  const timeoutMs = options.timeoutMs || PNG_TIMEOUT_MS
  const dataUrl = await Promise.race([
    task,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`长图生成超时（${timeoutMs / 1000}s）`)), timeoutMs)
    )
  ])

  triggerDownload(dataUrl, buildFilename(options.filename, 'png'))
}

/**
 * 收集当前文档中所有生效的样式表 href（用于把 KaTeX/Markdown 样式带进打印窗口）。
 * 跨域 <link>（href 以 http 开头且非同源）会被跳过，避免污染。
 *
 * @returns {string[]} 样式表 href 列表
 */
export function collectStylesheets() {
  const sheets = []
  try {
    for (const sheet of document.styleSheets) {
      const href = sheet.href
      if (!href) continue                  // <style> 块，外联拿不到，跳过
      try {
        const url = new URL(href, location.href)
        // 仅保留同源样式表，跨域外链注入到打印窗口也加载不到
        if (url.origin === location.origin) {
          sheets.push(href)
        }
      } catch {
        // 相对路径 href，URL 构造失败时按原样保留
        sheets.push(href)
      }
    }
  } catch {
    // document.styleSheets 在某些隐私模式下会抛 SecurityError，容错返回空
  }
  return sheets
}

/**
 * 净化一段 HTML 字符串：移除 <script>、<style>、on* 事件属性、javascript: 链接。
 * 用 DOMParser 解析后遍历删点，比正则更可靠。
 *
 * @param {string} html
 * @returns {string} 净化后的 HTML
 */
export function sanitizeHtml(html) {
  if (typeof DOMParser === 'undefined') return html  // 测试环境兜底
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  // 删除所有 <script> 和 <style>（样式走外链，不内联）
  body.querySelectorAll('script, style').forEach((n) => n.remove())

  // 删除所有 on* 事件属性和 javascript: href
  body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name)
      } else if (attr.name === 'href' || attr.name === 'src') {
        const v = (attr.value || '').trim().toLowerCase()
        if (v.startsWith('javascript:')) {
          el.removeAttribute(attr.name)
        }
      }
    }
  })

  return body.innerHTML
}

/**
 * 把目标 DOM 节点打印为 PDF（通过浏览器打印对话框，用户选"另存为 PDF"）。
 *
 * 策略：开一个临时隐藏子窗口，注入节点的 outerHTML（经 sanitize）+ 当前文档的同源样式表
 *      （含 KaTeX 等）+ 一份干净的打印 CSS，调子窗口的 print()。
 * 异常安全：所有跨域/异步操作均包在 try/catch 内，弹窗被关闭时走 reject，
 *           保证调用方的 busy 状态一定被复位。
 *
 * @param {HTMLElement} node - 要打印的节点
 * @param {Object} [opts]
 * @param {string} [opts.title] - 打印文档标题（影响默认文件名）
 * @returns {Promise<void>}
 */
export function printNode(node, opts = {}) {
  const title = (opts.title || '文档').toString()

  return new Promise((resolve, reject) => {
    let el
    try {
      el = getExportableNode(node)
    } catch (e) {
      reject(e)
      return
    }

    let win
    try {
      // noopener：切断 window.opener，防止打印窗口内的脚本回攻主页面（深度防御）
      win = window.open('', '_blank', 'width=900,height=700,noopener,noreferrer')
      if (!win) {
        throw new Error('弹窗被浏览器拦截，请允许本站弹窗后重试')
      }
    } catch (e) {
      reject(e)
      return
    }

    // 把当前文档生效的同源样式表（含 KaTeX）一并注入打印窗口
    const stylesheetLinks = collectStylesheets()
      .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
      .join('\n')

    const safeBody = sanitizeHtml(el.outerHTML)

    // 异步段：document.write / print / close 全部包进 try/catch，任何异常都 reject
    const fail = (err) => {
      try { win.close() } catch (_) { /* ignore */ }
      reject(err)
    }

    try {
      win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${stylesheetLinks}
<style>
  /* 打印专用基础样式：白底、合适字号、去除背景噪音 */
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
  }
  img, svg, canvas { max-width: 100% !important; height: auto !important; }
  pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; }
  pre { padding: 12px; background: #f7f9fc; border-radius: 6px; overflow: auto; white-space: pre-wrap !important; word-wrap: break-word; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d8dee8; padding: 8px; }
  /* 避免内容跨页断裂 */
  h1, h2, h3 { page-break-after: avoid; }
  pre, table, img { page-break-inside: avoid; }
  @page { margin: 16mm; }
</style>
</head>
<body>${safeBody}</body>
</html>`)
      win.document.close()
    } catch (err) {
      fail(err)
      return
    }

    // 给浏览器一点时间渲染再触发打印
    win.focus()
    setTimeout(() => {
      try {
        if (win.closed) {
          reject(new Error('打印窗口已被关闭'))
          return
        }
        win.print()
        // 打印对话框关闭后清理（beforeprint/afterprint 跨浏览器兼容性参差，setTimeout 兜底）
        setTimeout(() => {
          try {
            if (!win.closed) win.close()
          } catch (_) { /* ignore */ }
          resolve()
        }, 300)
      } catch (err) {
        fail(err)
      }
    }, 250)
  })
}

/**
 * 打印 iframe 内的 HTML 讲义（原排版 100% 保真）。
 *
 * 直接调用 iframe 自己的 contentWindow.print()，浏览器会按 iframe 内
 * 已渲染的样式打印，不需要重新注入 CSS。
 *
 * @param {HTMLIFrameElement} iframeEl
 * @returns {Promise<void>}
 */
export function printIframe(iframeEl) {
  return new Promise((resolve, reject) => {
    let el
    try {
      el = getExportableNode(iframeEl)
    } catch (e) {
      reject(e)
      return
    }

    try {
      const cw = el.contentWindow
      if (!cw) {
        throw new Error('iframe 尚未加载或无法访问（跨域限制）')
      }
      cw.focus()
      cw.print()
      // iframe 打印是同步触发，但对话框是模态的，浏览器异步返回
      setTimeout(resolve, 100)
    } catch (err) {
      reject(err)
    }
  })
}

/* ============================================================
 * 内部工具
 * ============================================================ */

/**
 * 简易 HTML 转义（用于文本节点语境，如 <title>）。
 * 注：单引号在文本节点语境无风险，不转义；若复用到属性语境请改用 escapeAttr。
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 属性语境转义：单引号和双引号都转，用于 href 等属性值 */
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
