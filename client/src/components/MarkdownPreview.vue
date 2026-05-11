<template>
  <div class="markdown-preview">
    <div v-if="loading" class="markdown-state">正在渲染 Markdown...</div>
    <div v-else-if="error" class="markdown-state error">{{ error }}</div>
    <article v-else ref="container" class="markdown-body" v-html="html"></article>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'

const props = defineProps({
  docId: {
    type: Number,
    required: true
  }
})

const loading = ref(false)
const error = ref('')
const html = ref('')
const container = ref(null)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

const defaultFence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const token = tokens[idx]
  const lang = token.info.trim().split(/\s+/)[0].toLowerCase()
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`
  }
  return defaultFence(tokens, idx, options, env, slf)
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default'
})

async function loadMarkdown() {
  loading.value = true
  error.value = ''
  try {
    const res = await axios.get(`/api/knowledge/${props.docId}/markdown`)
    html.value = md.render(res.data.content || '')
    loading.value = false
    await nextTick()
    await mermaid.run({ nodes: container.value?.querySelectorAll('.mermaid') || [] })
  } catch (e) {
    error.value = e.response?.data?.error || 'Markdown 渲染失败'
    loading.value = false
  }
}

onMounted(loadMarkdown)
watch(() => props.docId, loadMarkdown)
</script>

<style scoped>
.markdown-preview {
  height: 100%;
  overflow: auto;
  background: #ffffff;
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
