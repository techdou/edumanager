<template>
  <div ref="root" class="markdown-preview">
    <div v-if="loading" class="markdown-state">正在渲染 Markdown...</div>
    <div v-else-if="error" class="markdown-state error">{{ error }}</div>
    <template v-else>
      <div class="md-toolbar" role="toolbar" aria-label="导出工具">
        <button type="button" class="md-tool-btn" :disabled="busy" aria-label="导出为 PDF" @click="onExportPdf">PDF</button>
        <button type="button" class="md-tool-btn" :disabled="busy" aria-label="导出为长图 PNG" @click="onExportPng">长图</button>
        <button type="button" class="md-tool-btn" :disabled="busy || !rawMarkdown" aria-label="下载 Markdown 原文" @click="onExportMd">原文</button>
        <span v-if="busy" class="md-tool-hint" aria-live="polite">正在生成…</span>
      </div>
      <article ref="container" class="markdown-body" v-html="html"></article>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import axios from 'axios'
import MarkdownIt from 'markdown-it'
// @vscode/markdown-it-katex 默认导出即为 markdown-it 插件
import katexPlugin from '@vscode/markdown-it-katex'
// KaTeX 样式：JS import 保证无论从哪个入口加载都生效
import 'katex/dist/katex.min.css'
import { showToast } from '../lib/http.js'
import { exportNodeToPng, printNode, buildFilename, triggerDownload } from '../utils/exporter.js'

const props = defineProps({
  docId: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    default: '知识文档'
  },
  // 懒加载：组件进入视口后才拉取 markdown 内容，避免列表页 N+1 请求风暴
  lazy: {
    type: Boolean,
    default: true
  }
})

const root = ref(null)
const loading = ref(false)
const error = ref('')
const html = ref('')
const rawMarkdown = ref('')
const container = ref(null)
const busy = ref(false)
const inView = ref(!props.lazy)
let observer = null

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
}).use(katexPlugin)

// mermaid 代码块拦截：转成 <pre class="mermaid">，渲染时由动态加载的 mermaid 处理
const defaultFence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const token = tokens[idx]
  const lang = token.info.trim().split(/\s+/)[0].toLowerCase()
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`
  }
  return defaultFence(tokens, idx, options, env, slf)
}

// 动态加载 mermaid 并初始化（避免打进主 chunk）
let mermaidReady = null
async function ensureMermaid() {
  if (mermaidReady) return mermaidReady
  mermaidReady = import('mermaid').then((mod) => {
    const mermaid = mod.default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default'
    })
    return mermaid
  })
  return mermaidReady
}

async function loadMarkdown() {
  loading.value = true
  error.value = ''
  try {
    const res = await axios.get(`/api/knowledge/${props.docId}/markdown`)
    rawMarkdown.value = res.data.content || ''
    html.value = md.render(rawMarkdown.value)
    loading.value = false

    // 仅当确实有 mermaid 代码块时才动态加载 mermaid（按需）
    await nextTick()
    const mermaidNodes = container.value?.querySelectorAll('.mermaid')
    if (mermaidNodes && mermaidNodes.length > 0) {
      const mermaid = await ensureMermaid()
      await mermaid.run({ nodes: mermaidNodes })
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Markdown 渲染失败'
    loading.value = false
  }
}

function startLoad() {
  if (inView.value && !html.value && !loading.value) {
    loadMarkdown()
  }
}

async function onExportPdf() {
  if (busy.value || !container.value) return
  busy.value = true
  try {
    await printNode(container.value, { title: props.title })
  } catch (e) {
    showToast(e.message || 'PDF 导出失败')
  } finally {
    busy.value = false
  }
}

async function onExportPng() {
  if (busy.value || !container.value) return
  busy.value = true
  try {
    await exportNodeToPng(container.value, {
      filename: props.title,        // 传主名，扩展名由 exporter 内部统一加
      ratio: '9:16'
    })
  } catch (e) {
    showToast(e.message || '长图导出失败')
  } finally {
    busy.value = false
  }
}

function onExportMd() {
  if (busy.value || !rawMarkdown.value) return
  const blob = new Blob([rawMarkdown.value], { type: 'text/markdown;charset=utf-8' })
  triggerDownload(blob, buildFilename(props.title, 'md'))
}

onMounted(() => {
  if (props.lazy && typeof IntersectionObserver !== 'undefined' && root.value) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          inView.value = true
          startLoad()
          observer.disconnect()
          observer = null
        }
      }
    }, { rootMargin: '200px' })  // 提前 200px 触发，避免滚到才加载的视觉延迟
    observer.observe(root.value)
  } else {
    // 不支持 IntersectionObserver 或非懒加载：直接加载
    startLoad()
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

watch(() => props.docId, (newId, oldId) => {
  if (newId !== oldId && inView.value) {
    html.value = ''
    rawMarkdown.value = ''
    loadMarkdown()
  }
})
</script>

<!-- 非 scoped：错误公式样式需作用于 v-html 渲染的内容 -->
<style>
/* KaTeX 错误公式：红色显示原文，不阻断渲染 */
.katex-error {
  color: #b42318;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>

<style scoped>
.markdown-preview {
  height: 100%;
  overflow: auto;
  background: #ffffff;
}

/* 导出工具栏：悬浮在内容右上角，半透明背景避免遮挡内容 */
.md-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid #eef1f5;
}

.md-tool-btn {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: #ffffff;
  color: #4d596d;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.md-tool-btn:hover:not(:disabled) {
  background: #f1f5fb;
  border-color: #2f6fed;
  color: #2f6fed;
}

.md-tool-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.md-tool-hint {
  color: #7a8494;
  font-size: 12px;
}

.markdown-state {
  padding: 18px;
  color: #7a8494;
  font-size: 13px;
}

.markdown-state.error {
  color: #b42318;
}

.markdown-body {
  padding: 18px;
  color: #242a35;
  font-size: 14px;
  line-height: 1.65;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 0 0 10px;
  color: #172033;
  line-height: 1.3;
}

.markdown-body :deep(h1) {
  font-size: 24px;
}

.markdown-body :deep(h2) {
  margin-top: 18px;
  font-size: 20px;
}

.markdown-body :deep(h3) {
  margin-top: 14px;
  font-size: 17px;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(pre),
.markdown-body :deep(blockquote),
.markdown-body :deep(table) {
  margin: 0 0 12px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 22px;
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border-radius: 5px;
  background: #f1f5fb;
  color: #172033;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #f7f9fc;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  padding-left: 12px;
  border-left: 3px solid #d8dee8;
  color: #4d596d;
}

.markdown-body :deep(a) {
  color: #1f5fce;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px;
  border: 1px solid #e6eaf0;
}

.markdown-body :deep(.mermaid) {
  display: grid;
  justify-content: center;
  padding: 12px;
  background: #ffffff;
}
</style>
