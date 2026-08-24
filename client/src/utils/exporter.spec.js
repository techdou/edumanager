/**
 * exporter.spec.js — 导出工具单元测试
 *
 * 覆盖范围：
 * - 纯函数：文件名净化、节点校验、选项校验、画布尺寸计算
 * - 副作用函数：mock DOM API 后验证调用参数与流程
 *
 * 运行：npm test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  buildFilename,
  getExportableNode,
  validateExportOptions,
  computeCanvasSize,
  PNG_RATIOS,
  triggerDownload,
  exportNodeToPng,
  printNode,
  printIframe,
  sanitizeHtml,
  collectStylesheets
} from './exporter.js'

/* ============================================================
 * buildFilename —— 纯函数
 * ============================================================ */
describe('buildFilename', () => {
  it('正常拼接主名和扩展名', () => {
    expect(buildFilename('讲义1', 'pdf')).toBe('讲义1.pdf')
    expect(buildFilename('lecture', 'png')).toBe('lecture.png')
  })

  it('扩展名带前导点也能处理', () => {
    expect(buildFilename('doc', '.pdf')).toBe('doc.pdf')
    expect(buildFilename('doc', '..PDF')).toBe('doc.pdf')
  })

  it('替换非法字符为下划线', () => {
    expect(buildFilename('a/b\\c:d*e?f<g>h|i', 'pdf')).toBe('a_b_c_d_e_f_g_h_i.pdf')
    expect(buildFilename('控制\u0007字符', 'pdf')).toBe('控制_字符.pdf')
  })

  it('去除首尾空格和结尾点', () => {
    expect(buildFilename('  讲义  ', 'pdf')).toBe('讲义.pdf')
    expect(buildFilename('讲义...', 'pdf')).toBe('讲义.pdf')
  })

  it('空主名兜底为"导出"', () => {
    expect(buildFilename('', 'pdf')).toBe('导出.pdf')
    expect(buildFilename('   ', 'pdf')).toBe('导出.pdf')
    expect(buildFilename('///', 'pdf')).toBe('___.pdf') // 非法字符替换后非空
  })

  it('超长主名截断到 120 字符', () => {
    const long = 'a'.repeat(200)
    const result = buildFilename(long, 'pdf')
    expect(result.length).toBe(120 + 4) // 120 + '.pdf'
    expect(result.startsWith('a'.repeat(120))).toBe(true)
  })

  it('无扩展名时只返回主名', () => {
    expect(buildFilename('讲义', '')).toBe('讲义')
  })

  it('非字符串入参强制转换为字符串', () => {
    expect(buildFilename(123, 'pdf')).toBe('123.pdf')
    expect(buildFilename(null, 'pdf')).toBe('导出.pdf')
    expect(buildFilename(undefined, 'pdf')).toBe('导出.pdf')
  })
})

/* ============================================================
 * getExportableNode —— 校验
 * ============================================================ */
describe('getExportableNode', () => {
  it('合法 DOM 元素直接返回', () => {
    const div = document.createElement('div')
    expect(getExportableNode(div)).toBe(div)
  })

  it('null 抛 TypeError', () => {
    expect(() => getExportableNode(null)).toThrow(TypeError)
    expect(() => getExportableNode(null)).toThrow(/为空/)
  })

  it('undefined 抛 TypeError', () => {
    expect(() => getExportableNode(undefined)).toThrow(TypeError)
  })

  it('非元素对象抛 TypeError', () => {
    expect(() => getExportableNode({})).toThrow(TypeError)
    expect(() => getExportableNode('div')).toThrow(TypeError)
    expect(() => getExportableNode(42)).toThrow(TypeError)
    expect(() => getExportableNode([])).toThrow(TypeError)
  })

  it('文本节点（nodeType=3）抛 TypeError', () => {
    const text = document.createTextNode('hello')
    expect(() => getExportableNode(text)).toThrow(TypeError)
  })
})

/* ============================================================
 * validateExportOptions —— 选项规整
 * ============================================================ */
describe('validateExportOptions', () => {
  it('空入参返回默认值', () => {
    const r = validateExportOptions()
    // filename 默认不带扩展名，由调用方（如 exportNodeToPng）内部统一加
    expect(r.filename).toBe('导出')
    expect(r.ratio).toBe('9:16')
    expect(r.pixelRatio).toBe(2)
    expect(r.backgroundColor).toBe('#ffffff')
    expect(r.timeoutMs).toBe(20000)
  })

  it('合法 ratio 通过', () => {
    for (const key of Object.keys(PNG_RATIOS)) {
      expect(validateExportOptions({ ratio: key }).ratio).toBe(key)
    }
  })

  it('非法 ratio 抛错并提示可选值', () => {
    expect(() => validateExportOptions({ ratio: '2:3' })).toThrow(/不支持的宽高比/)
    expect(() => validateExportOptions({ ratio: '2:3' })).toThrow(/9:16/)
  })

  it('自定义字段覆盖默认值', () => {
    const r = validateExportOptions({ filename: 'x.png', pixelRatio: 3 })
    expect(r.filename).toBe('x.png')
    expect(r.pixelRatio).toBe(3)
  })
})

/* ============================================================
 * computeCanvasSize
 * ============================================================ */
describe('computeCanvasSize', () => {
  it('内容高度小于比例高度时按比例出图', () => {
    // 9:16 → 720 宽 / (720/(9/16)) = 720 / 1280
    const r = computeCanvasSize(500, '9:16')
    expect(r.width).toBe(720)
    expect(r.height).toBe(1280)
  })

  it('内容高度大于比例高度时按内容出图（仍是长图）', () => {
    const r = computeCanvasSize(2000, '1:1')
    expect(r.width).toBe(720)
    expect(r.height).toBe(2000)
  })

  it('未知 ratio 兜底 9:16', () => {
    const r = computeCanvasSize(100, 'unknown')
    expect(r.height).toBe(Math.round(720 / PNG_RATIOS['9:16']))
  })

  it('支持自定义基准宽度', () => {
    const r = computeCanvasSize(100, '1:1', 1080)
    expect(r.width).toBe(1080)
  })
})

/* ============================================================
 * triggerDownload —— mock DOM
 * ============================================================ */
describe('triggerDownload', () => {
  let clickSpy, appendSpy, removeSpy, createSpy

  beforeEach(() => {
    clickSpy = vi.fn()
    appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
    // mock createElement 返回带 click 的假 anchor
    createSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickSpy,
      href: '',
      download: '',
      rel: ''
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('字符串 URL：触发 a.click 并设置 download', () => {
    triggerDownload('https://x.com/a.pdf', 'file.pdf')
    expect(createSpy).toHaveBeenCalledWith('a')
    const anchor = createSpy.mock.results[0].value
    expect(anchor.href).toBe('https://x.com/a.pdf')
    expect(anchor.download).toBe('file.pdf')
    expect(anchor.rel).toBe('noopener')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('Blob：用 URL.createObjectURL 转换后下载', () => {
    const blob = new Blob(['x'], { type: 'text/plain' })
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // happy-dom 的 createObjectURL 可能未实现，mock 掉
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')

    triggerDownload(blob, 'blob.txt')
    const anchor = createSpy.mock.results[0].value
    expect(anchor.href).toBe('blob:fake')
    expect(anchor.download).toBe('blob.txt')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('元素被 append 到 body 再 remove', () => {
    triggerDownload('url', 'f.pdf')
    expect(appendSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })
})

/* ============================================================
 * exportNodeToPng —— mock html-to-image
 * ============================================================ */
describe('exportNodeToPng', () => {
  let createdAnchors

  beforeEach(() => {
    createdAnchors = []
    // 拦截真实 anchor 创建：记录每次创建的 <a>，stub click 防止 happy-dom 报错
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (String(tag).toLowerCase() === 'a') {
        el.click = vi.fn()
        createdAnchors.push(el)
      }
      return el
    })
    // triggerDownload 会 appendChild/removeChild 到 body，正常执行即可
  })
  afterEach(() => vi.restoreAllMocks())

  it('调用 toPng 并触发下载，文件名净化为 .png', async () => {
    const toPngMod = await import('html-to-image')
    const toPngSpy = vi.spyOn(toPngMod, 'toPng').mockResolvedValue('data:image/png;base64,xxx')

    const node = document.createElement('article')
    Object.defineProperty(node, 'scrollHeight', { value: 500, configurable: true })

    // filename 传主名（可含非法字符，会被净化），扩展名由内部统一追加
    await exportNodeToPng(node, { filename: '我的/讲义?', ratio: '1:1' })

    expect(toPngSpy).toHaveBeenCalledTimes(1)
    const [passedNode, opts] = toPngSpy.mock.calls[0]
    expect(passedNode).toBe(node)
    expect(opts.pixelRatio).toBe(2)
    expect(opts.backgroundColor).toBe('#ffffff')
    expect(opts.cacheBust).toBe(true)
    expect(typeof opts.filter).toBe('function')
    // ratio 已接入：canvasWidth/canvasHeight 应被传入
    expect(opts.canvasWidth).toBe(720)
    expect(opts.canvasHeight).toBeGreaterThan(0)
    // 关键断言：真实下载的 anchor.download 必须是净化后的 .png 文件名
    expect(createdAnchors).toHaveLength(1)
    expect(createdAnchors[0].download).toBe('我的_讲义_.png')
    expect(createdAnchors[0].href).toBe('data:image/png;base64,xxx')
    expect(createdAnchors[0].click).toHaveBeenCalledTimes(1)
  })

  it('filename 默认值兜底为"导出.png"', async () => {
    const toPngMod = await import('html-to-image')
    vi.spyOn(toPngMod, 'toPng').mockResolvedValue('data:')

    await exportNodeToPng(document.createElement('div'))
    expect(createdAnchors[0].download).toBe('导出.png')
  })

  it('非节点入参抛错', async () => {
    await expect(exportNodeToPng(null)).rejects.toThrow(/为空|DOM/)
  })

  it('非法 ratio 抛错', async () => {
    const node = document.createElement('div')
    await expect(exportNodeToPng(node, { ratio: 'bad' })).rejects.toThrow(/宽高比/)
  })

  it('toPng 超时则 reject', async () => {
    const toPngMod = await import('html-to-image')
    // 永不 resolve 的 promise
    vi.spyOn(toPngMod, 'toPng').mockReturnValue(new Promise(() => {}))

    const node = document.createElement('div')
    await expect(
      exportNodeToPng(node, { timeoutMs: 50 })
    ).rejects.toThrow(/超时/)
  })

  it('filter 过滤掉 .export-skip 元素', async () => {
    const toPngMod = await import('html-to-image')
    const toPngSpy = vi.spyOn(toPngMod, 'toPng').mockResolvedValue('data:')

    const node = document.createElement('div')
    await exportNodeToPng(node)

    const filter = toPngSpy.mock.calls[0][1].filter
    const skipEl = document.createElement('div')
    skipEl.classList.add('export-skip')
    const keepEl = document.createElement('div')

    expect(filter(skipEl)).toBe(false)
    expect(filter(keepEl)).toBe(true)
  })
})

/* ============================================================
 * printNode —— mock window.open
 * ============================================================ */
describe('printNode', () => {
  afterEach(() => vi.restoreAllMocks())

  // 用 fake timers 跳过 setTimeout，避免每个用例等 250ms
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function makeFakeWin(overrides = {}) {
    const fakeDoc = { write: vi.fn(), close: vi.fn() }
    return {
      document: fakeDoc,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      closed: false,
      ...overrides
    }
  }

  it('打开新窗口并写入 outerHTML + 调用 print，含 noopener', async () => {
    const fakeWin = makeFakeWin()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin)

    const node = document.createElement('article')
    node.innerHTML = '<h1>标题</h1><p>内容</p>'
    const p = printNode(node, { title: '我的文档' })
    await vi.advanceTimersByTimeAsync(600)

    await p
    expect(openSpy).toHaveBeenCalledWith('', '_blank', expect.stringContaining('noopener'))
    expect(openSpy.mock.calls[0][2]).toContain('noreferrer')
    const written = fakeWin.document.write.mock.calls[0][0]
    expect(written).toContain('<h1>标题</h1>')
    expect(written).toContain('我的文档')
    expect(written).toContain('@page')
    expect(fakeWin.focus).toHaveBeenCalled()
    expect(fakeWin.print).toHaveBeenCalled()
  })

  it('body 中的 <script> 和 on* 属性被净化', async () => {
    const fakeWin = makeFakeWin()
    vi.spyOn(window, 'open').mockReturnValue(fakeWin)

    const node = document.createElement('div')
    node.innerHTML = '<p onclick="alert(1)">x</p><script>alert(2)</script><a href="javascript:alert(3)">link</a>'
    const p = printNode(node, { title: 't' })
    await vi.advanceTimersByTimeAsync(600)
    await p

    const written = fakeWin.document.write.mock.calls[0][0]
    expect(written).not.toContain('<script>')
    expect(written).not.toContain('onclick')
    expect(written).not.toContain('javascript:')
    // 正常内容保留
    expect(written).toContain('<p>x</p>')
    expect(written).toContain('<a>link</a>')
  })

  it('title 转义防注入', async () => {
    const fakeWin = makeFakeWin()
    vi.spyOn(window, 'open').mockReturnValue(fakeWin)

    const p = printNode(document.createElement('div'), { title: '<script>x</script>' })
    await vi.advanceTimersByTimeAsync(600)
    await p
    const written = fakeWin.document.write.mock.calls[0][0]
    expect(written).not.toContain('<title><script>x</script></title>')
    expect(written).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>')
  })

  it('弹窗被拦截时 reject', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    await expect(printNode(document.createElement('div'))).rejects.toThrow(/弹窗/)
  })

  it('窗口在触发 print 前已被关闭时 reject', async () => {
    const fakeWin = makeFakeWin({ closed: true })
    vi.spyOn(window, 'open').mockReturnValue(fakeWin)

    const p = printNode(document.createElement('div'))
    // 先挂占位 catch，防止推进定时器时 rejection 在 await 前成为 unhandled rejection
    p.catch(() => {})
    // 推进定时器让 setTimeout(250) 触发；此时 win.closed=true，应走 reject 路径
    await vi.advanceTimersByTimeAsync(300)
    await expect(p).rejects.toThrow(/关闭/)
    expect(fakeWin.print).not.toHaveBeenCalled()
  })

  it('非节点入参抛错', async () => {
    await expect(printNode(null)).rejects.toThrow(/为空|DOM/)
  })
})

/* ============================================================
 * sanitizeHtml —— DOMParser 净化
 * ============================================================ */
describe('sanitizeHtml', () => {
  it('移除 <script>', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('<p>ok</p>')
  })

  it('移除 <style>', () => {
    const out = sanitizeHtml('<style>body{color:red}</style><p>x</p>')
    expect(out).not.toContain('<style>')
    expect(out).toContain('<p>x</p>')
  })

  it('移除 on* 事件属性', () => {
    const out = sanitizeHtml('<p onclick="x()">hi</p><img onerror="y()">')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
    expect(out).toContain('<p>hi</p>')
  })

  it('移除 javascript: 链接', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">l</a>')
    expect(out).not.toContain('javascript:')
  })

  it('保留正常属性和链接', () => {
    const out = sanitizeHtml('<a href="https://ok.com">l</a><img src="x.png">')
    expect(out).toContain('href="https://ok.com"')
    expect(out).toContain('src="x.png"')
  })
})

/* ============================================================
 * collectStylesheets
 * ============================================================ */
describe('collectStylesheets', () => {
  afterEach(() => vi.restoreAllMocks())

  it('返回数组，不抛错（happy-dom 下 styleSheets 可能为空）', () => {
    const r = collectStylesheets()
    expect(Array.isArray(r)).toBe(true)
  })
})

/* ============================================================
 * printIframe —— mock contentWindow
 * ============================================================ */
describe('printIframe', () => {
  afterEach(() => vi.restoreAllMocks())

  it('调用 iframe.contentWindow.print', async () => {
    const iframe = document.createElement('iframe')
    const focusSpy = vi.fn()
    const printSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { focus: focusSpy, print: printSpy },
      configurable: true
    })

    await printIframe(iframe)
    expect(focusSpy).toHaveBeenCalled()
    expect(printSpy).toHaveBeenCalled()
  })

  it('无 contentWindow（跨域/未加载）抛错', async () => {
    const iframe = document.createElement('iframe')
    Object.defineProperty(iframe, 'contentWindow', {
      value: null,
      configurable: true
    })
    await expect(printIframe(iframe)).rejects.toThrow(/iframe|跨域|加载/)
  })

  it('非 iframe 元素抛错', async () => {
    await expect(printIframe(null)).rejects.toThrow(/为空|DOM/)
  })
})
