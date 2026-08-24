<template>
  <div class="lecture-page" :class="{ 'lecture-page--native': nativeLayout }">
    <header class="lecture-header">
      <div class="header-content">
        <router-link to="/" class="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回列表</span>
        </router-link>
        <h1 class="lecture-title">{{ lecture?.title || '讲义浏览' }}</h1>
        <button
          v-if="currentSrc && !nativeLayout"
          type="button"
          class="export-pdf-btn"
          :disabled="exporting"
          @click="onExportPdf"
        >{{ exporting ? '生成中…' : '导出 PDF' }}</button>
        <button
          type="button"
          class="export-pdf-btn notes-toggle-btn"
          @click="toggleNotes"
        >笔记</button>
        <div v-if="currentPath && !nativeLayout" class="read-progress">
          <span>{{ readProgress }}%</span>
          <div><i :style="{ width: `${readProgress}%` }"></i></div>
        </div>
      </div>
    </header>

    <div class="lecture-body">
      <!-- Floating toggle (visible when sidebar collapsed on PC) -->
      <button
        v-if="!isMobile && !nativeLayout"
        class="sidebar-pc-toggle"
        :class="{ 'sidebar-pc-toggle--visible': sidebarCollapsed }"
        @click="sidebarCollapsed = false"
        title="展开目录"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
        </svg>
      </button>

      <!-- Mobile hamburger button (shows when sidebar is hidden on mobile) -->
      <button
        v-if="!nativeLayout"
        class="mobile-sidebar-btn"
        :class="{ 'mobile-sidebar-btn--visible': sidebarCollapsed }"
        @click="sidebarCollapsed = false"
        title="打开目录"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <!-- Sidebar: chapters or TOC -->
      <aside v-if="!nativeLayout" class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
        <div class="sidebar-header">
          <h3 class="sidebar-title">{{ toc ? '章节导航' : '章节目录' }}</h3>
          <button 
            class="sidebar-toggle"
            @click="sidebarCollapsed = !sidebarCollapsed"
            :title="sidebarCollapsed ? '展开目录' : '收起目录'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path v-if="!sidebarCollapsed" d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
              <path v-else d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
            </svg>
          </button>
        </div>
        
        <!-- Chapter list (multi-chapter lecture) -->
        <nav v-if="chapters.length > 1 && !showToc" class="chapter-list">
          <router-link 
            v-for="chapter in chapters" 
            :key="chapter.id"
            :to="`/lecture/${slug}/${chapter.slug}`"
            :class="['chapter-item', { active: currentChapter === chapter.slug }]"
          >
            <span class="chapter-num">{{ String(chapter.id).padStart(2, '0') }}</span>
            <span class="chapter-name">{{ chapter.title }}</span>
          </router-link>
        </nav>

        <!-- TOC list (single-chapter with headings) -->
        <nav v-if="showToc && toc" class="toc-list">
          <div v-for="mod in toc.modules" :key="mod.id" class="toc-module">
            <a
              :href="mod.anchor"
              :class="['toc-module-title', { active: isModuleActive(mod) }]"
              @click.prevent="scrollToAnchor(mod.anchor)"
            >
              <span class="toc-module-text">{{ mod.title }}</span>
              <span v-if="mod.time" class="toc-module-time">{{ mod.time }}</span>
            </a>
            <div v-if="mod.sections.length" class="toc-sections">
              <a
                v-for="sec in mod.sections"
                :key="sec.id"
                :href="sec.anchor"
                :class="['toc-section-item', { active: activeAnchor === sec.anchor }]"
                @click.prevent="scrollToAnchor(sec.anchor)"
              >
                {{ sec.title }}
              </a>
            </div>
          </div>
        </nav>

        <!-- Single chapter, no TOC -->
        <nav v-if="chapters.length === 1 && !showToc" class="chapter-list">
          <div class="chapter-item active">
            <span class="chapter-num">01</span>
            <span class="chapter-name">{{ chapters[0].title }}</span>
          </div>
        </nav>
      </aside>

      <!-- Mobile backdrop (closes sidebar when tapped) -->
      <div
        v-if="isMobile && !sidebarCollapsed"
        class="mobile-backdrop"
        @click="sidebarCollapsed = true"
      ></div>

      <!-- Viewer -->
      <main class="viewer">
        <div v-if="loading" class="viewer-loading">
          <div class="skeleton" style="height: 32px; width: 50%; margin-bottom: 24px"></div>
          <div class="skeleton" style="height: 200px; margin-bottom: 16px"></div>
          <div class="skeleton" style="height: 200px"></div>
        </div>
        
        <iframe
          v-else-if="currentSrc"
          ref="viewerFrame"
          :src="currentSrc"
          class="viewer-frame"
          sandbox="allow-scripts"
          @load="onIframeLoad"
          @error="iframeError = true"
        />
        <!-- 进度/TOC 跟踪脚本由后端静态服务注入（utils/lectureInjector），
             经 postMessage 通信，因此 iframe 无需 allow-same-origin —— 讲义内
             任何脚本都摸不到主站的 localStorage/token -->
        
        <div v-else-if="iframeError" class="empty-state">
          <div class="empty-state-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9"/>
              <path d="M3 15h5l2 3h4l2-3h5"/>
              <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/>
            </svg>
          </div>
          <h3 class="empty-state-title">讲义内容暂未上传</h3>
          <p class="empty-state-desc">该章节的内容尚未准备好，请联系管理员上传讲义文件</p>
        </div>
        
        <div v-else class="empty-state">
          <div class="empty-state-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/>
              <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/>
            </svg>
          </div>
          <h3 class="empty-state-title">选择章节开始阅读</h3>
          <p class="empty-state-desc">从左侧目录选择章节，讲义内容将在此显示</p>
        </div>
      </main>
    </div>

    <!-- 章节笔记抽屉 -->
    <Teleport to="body">
      <Transition name="notes-drawer">
        <aside v-if="notesPanelOpen" class="notes-panel" aria-label="我的笔记">
          <div class="notes-header">
            <h3>我的笔记</h3>
            <button class="notes-close" aria-label="关闭笔记" @click="notesPanelOpen = false">✕</button>
          </div>
          <div class="notes-body">
            <div class="note-composer">
              <textarea
                v-model="newNote"
                :placeholder="`记录笔记（${currentChapterMeta()?.title || '当前章节'}）…`"
                rows="3"
                maxlength="5000"
              ></textarea>
              <button
                type="button"
                class="note-save-btn"
                :disabled="noteSaving || !newNote.trim()"
                @click="addNote"
              >{{ noteSaving ? '保存中…' : '添加笔记' }}</button>
            </div>
            <div v-if="notesLoading" class="notes-empty">加载中…</div>
            <div v-else-if="notes.length === 0" class="notes-empty">还没有笔记，写下第一条吧</div>
            <div v-for="note in notes" :key="note.id" class="note-item">
              <div class="note-meta">
                <span class="note-chapter">{{ chapterTitleOf(note.chapter_slug) }}</span>
                <button type="button" class="note-del-btn" @click="removeNote(note.id)">删除</button>
              </div>
              <p class="note-content">{{ note.content }}</p>
              <small class="note-time">{{ formatNoteTime(note.updated_at) }}</small>
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import api, { showToast } from '../lib/http'
import { decodeJwtPayload } from '../lib/jwt'
import { buildChapterSrc } from '../utils/lectureUrl'
import { formatDateTime } from '../utils/date'
import { printIframe } from '../utils/exporter.js'

const route = useRoute()
const slug = computed(() => route.params.slug)
const currentChapter = computed(() => route.params.chapter || chapters.value[0]?.slug || '')
const sidebarCollapsed = ref(false)
const isMobile = ref(window.innerWidth <= 768)
const loading = ref(true)
const viewerFrame = ref(null)
const iframeError = ref(false)
const exporting = ref(false)

async function onExportPdf() {
  if (exporting.value || !viewerFrame.value) return
  exporting.value = true
  try {
    await printIframe(viewerFrame.value)
  } catch (e) {
    showToast(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

const lecture = ref(null)
const chapters = ref([])
const toc = ref(null)
const activeAnchor = ref('')
const readProgress = ref(0)
const showToc = computed(() => !!toc.value && toc.value.modules.length > 0)
const nativeLayout = computed(() => lecture.value?.layout_mode === 'native')
const recentKeyPrefix = 'edumanager:recentLectures'

function currentUserKey() {
  const token = localStorage.getItem('token')
  const payload = token ? decodeJwtPayload(token) : null
  if (payload?.id) return payload.id
  return localStorage.getItem('studentUsername') || 'student'
}

function recentKey() {
  return `${recentKeyPrefix}:${currentUserKey()}`
}

const currentPath = computed(() => {
  if (!lecture.value || !currentChapter.value) return null
  const chapter = chapters.value.find(item => item.slug === currentChapter.value)
  return chapter?.path || null
})

const currentSrc = computed(() => {
  const chapter = chapters.value.find(item => item.slug === currentChapter.value)
  if (!chapter?.path) return ''
  return buildChapterSrc(lecture.value, chapter)
})

function syncViewportMode() {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) sidebarCollapsed.value = true
}

function handleTocMessage(e) {
  // sandbox(无 allow-same-origin) iframe 的 origin 序列化为 'null'；同源兜底留给未沙箱场景
  if (e.origin !== window.location.origin && e.origin !== 'null') return
  if (e.data?.type === 'viewer-hello') {
    // 查看器脚本就绪握手：下发已保存的阅读进度
    sendToViewer({ type: 'init-progress', progress: readProgress.value })
    return
  }
  if (e.data?.type === 'toc-active') {
    activeAnchor.value = e.data.anchor
  }
  if (e.data?.type === 'reading-progress') {
    readProgress.value = Math.max(0, Math.min(100, Math.round(Number(e.data.progress) || 0)))
    saveRecentLecture()
    reportProgress(readProgress.value >= 100)
  }
}

// ===== 学习进度上报（服务端，供班级看板/断点续学）=====
// 节流 8 秒；读完（100%）立即上报。失败静默：本地 localStorage 已兜底
let lastReportAt = 0
function reportProgress(force = false) {
  if (!lecture.value || !currentChapter.value) return
  const now = Date.now()
  if (!force && now - lastReportAt < 8000) return
  lastReportAt = now
  const chapter = currentChapterMeta()
  api.post('/api/progress', {
    lectureSlug: slug.value,
    chapterSlug: currentChapter.value,
    lectureTitle: lecture.value.title || '',
    chapterTitle: chapter?.title || '',
    progress: readProgress.value
  }).catch(() => {})
}

// ===== 章节笔记 =====
const notesPanelOpen = ref(false)
const notes = ref([])
const notesLoading = ref(false)
const newNote = ref('')
const noteSaving = ref(false)

function toggleNotes() {
  notesPanelOpen.value = !notesPanelOpen.value
  if (notesPanelOpen.value) loadNotes()
}

async function loadNotes() {
  if (!lecture.value) return
  notesLoading.value = true
  try {
    const res = await api.get('/api/notes', { params: { lectureSlug: slug.value } })
    notes.value = res.data
  } catch {
    notes.value = []
  } finally {
    notesLoading.value = false
  }
}

async function addNote() {
  const content = newNote.value.trim()
  if (!content || !currentChapter.value) return
  noteSaving.value = true
  try {
    await api.post('/api/notes', {
      lectureSlug: slug.value,
      chapterSlug: currentChapter.value,
      content,
      anchor: activeAnchor.value || null
    })
    newNote.value = ''
    await loadNotes()
  } catch (e) {
    showToast(e.response?.data?.error || '笔记保存失败')
  } finally {
    noteSaving.value = false
  }
}

async function removeNote(id) {
  try {
    await api.delete(`/api/notes/${id}`)
    notes.value = notes.value.filter(note => note.id !== id)
  } catch {
    showToast('删除失败')
  }
}

function chapterTitleOf(chapterSlug) {
  return chapters.value.find(item => item.slug === chapterSlug)?.title || chapterSlug
}

function formatNoteTime(value) {
  return formatDateTime(value)
}

function sendToViewer(msg) {
  const frame = viewerFrame.value
  if (!frame?.contentWindow) return false
  try {
    // 沙箱 iframe 的 origin 是 opaque，只能用 '*'；消息不含敏感内容，接收端校验来源
    frame.contentWindow.postMessage(msg, '*')
    return true
  } catch {
    // iframe 未就绪或已卸载
    return false
  }
}

function currentChapterMeta() {
  return chapters.value.find(item => item.slug === currentChapter.value)
}

function saveRecentLecture() {
  if (!lecture.value || !currentChapter.value) return
  const chapter = currentChapterMeta()
  const item = {
    lectureSlug: slug.value,
    chapterSlug: currentChapter.value,
    lectureTitle: lecture.value.title,
    chapterTitle: chapter?.title || lecture.value.title,
    progress: readProgress.value,
    updatedAt: Date.now()
  }
  try {
    const existing = JSON.parse(localStorage.getItem(recentKey()) || '[]')
    const next = [
      item,
      ...existing.filter(entry => `${entry.lectureSlug}/${entry.chapterSlug}` !== `${item.lectureSlug}/${item.chapterSlug}`)
    ].slice(0, 6)
    localStorage.setItem(recentKey(), JSON.stringify(next))
  } catch {
    localStorage.setItem(recentKey(), JSON.stringify([item]))
  }
}

function restoreSavedProgress() {
  if (!lecture.value || !currentChapter.value) return
  try {
    const items = JSON.parse(
      localStorage.getItem(recentKey())
      || localStorage.getItem(recentKeyPrefix)
      || '[]'
    )
    const item = items.find(entry =>
      entry.lectureSlug === slug.value && entry.chapterSlug === currentChapter.value
    )
    readProgress.value = Math.max(0, Math.min(100, Math.round(Number(item?.progress) || 0)))
  } catch {
    readProgress.value = 0
  }
}

function isModuleActive(module) {
  if (activeAnchor.value === module.anchor) return true
  return module.sections?.some(section => section.anchor === activeAnchor.value)
}

// 请求序号守卫：快速切换讲义/章节时，晚到的旧响应直接丢弃，
// 避免旧数据覆盖新数据（TOC 显示成上一个章节、进度条被重置）
let loadSeq = 0

async function loadLecture() {
  const seq = ++loadSeq
  loading.value = true
  toc.value = null
  activeAnchor.value = ''
  readProgress.value = 0
  iframeError.value = false

  try {
    // 详情接口只返回这一份讲义，替代原来的"拉全量列表再 find"
    const res = await api.get(`/api/lectures/detail/${slug.value}`)
    if (seq !== loadSeq) return
    const data = res.data
    lecture.value = data && data.slug ? data : null
    chapters.value = lecture.value?.chapters || []

    // 讲义不存在或无权限：给出明确提示而非空白
    if (!lecture.value) {
      showToast('讲义不存在或无权限访问', 'warn')
      loading.value = false
      return
    }

    restoreSavedProgress()
    loadToc()
  } catch (err) {
    if (seq !== loadSeq) return
    // 网络/服务错误已由 http 拦截器提示；此处仅保证 UI 不崩
    lecture.value = null
    chapters.value = []
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

let tocSeq = 0
const loadedTocKey = ref('')

async function loadToc() {
  const seq = ++tocSeq
  const key = `${slug.value}/${currentChapter.value}`
  toc.value = null
  activeAnchor.value = ''
  if (!currentPath.value || nativeLayout.value) return
  try {
    // 尝试加载当前章节的 TOC（失败不影响主流程）
    const tocRes = await api.get(`/api/lectures/toc/${slug.value}/${currentChapter.value}`)
    if (seq !== tocSeq || key !== `${slug.value}/${currentChapter.value}`) return
    toc.value = tocRes.data && tocRes.data.modules ? tocRes.data : null
    loadedTocKey.value = key
  } catch {
    if (seq === tocSeq) toc.value = null
  }
}

function onIframeLoad() {
  // 进度/TOC 脚本已由后端注入 HTML（见 utils/lectureInjector 通信协议）。
  // iframe 无 allow-same-origin，无法读 contentDocument；
  // 双保险：load 事件 + viewer-hello 握手各发一次初始进度
  sendToViewer({ type: 'init-progress', progress: readProgress.value })
}

function scrollToAnchor(anchor) {
  if (!viewerFrame.value) return
  const ok = sendToViewer({ type: 'scroll-to', anchor })
  if (ok) {
    activeAnchor.value = anchor
    if (isMobile.value) sidebarCollapsed.value = true
  }
}

// Listen for scroll messages from iframe
onMounted(() => {
  syncViewportMode()
  sidebarCollapsed.value = isMobile.value
  window.addEventListener('resize', syncViewportMode)
  window.addEventListener('message', handleTocMessage)
  loadLecture()
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportMode)
  window.removeEventListener('message', handleTocMessage)
})

watch(slug, () => loadLecture())
watch(currentChapter, (chapter) => {
  if (lecture.value && chapters.value.some(item => item.slug === chapter)) {
    // 同一讲义内切章节：只重置进度 + 重拉 TOC，不重拉讲义元数据
    readProgress.value = 0
    iframeError.value = false
    restoreSavedProgress()
    if (loadedTocKey.value !== `${slug.value}/${chapter}`) {
      loadToc()
    }
  } else {
    loadLecture()
  }
})
</script>

<style scoped>
.lecture-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.lecture-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: oklch(1 0 0 / 0.9);
}

.header-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  white-space: nowrap;
  flex-shrink: 0;
}

.back-link:hover {
  background: var(--color-bg);
  color: var(--color-ink);
}

.back-link svg {
  transition: transform var(--duration-fast) var(--ease-out-expo);
}

.back-link:hover svg {
  transform: translateX(-3px);
}

.lecture-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.read-progress {
  min-width: 140px;
  display: grid;
  gap: 5px;
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: right;
}

/* 导出 PDF 按钮：放在 read-progress 左侧，作为右对齐簇的第一项 */
.export-pdf-btn {
  margin-left: auto;
  margin-right: 12px;
  padding: 7px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.export-pdf-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.export-pdf-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 笔记按钮：export 按钮渲染时紧随其后，隐藏(native 布局)时自己右对齐 */
.notes-toggle-btn {
  margin-left: auto;
  flex-shrink: 0;
}

.export-pdf-btn + .notes-toggle-btn {
  margin-left: 0;
}

/* ===== 章节笔记抽屉 ===== */
.notes-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(380px, 92vw);
  z-index: 300;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.12);
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.notes-header h3 {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-ink);
}

.notes-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-ink-secondary);
  font-size: 14px;
  cursor: pointer;
}

.notes-close:hover {
  background: var(--color-border);
}

.notes-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.note-composer {
  display: grid;
  gap: var(--space-2);
}

.note-composer textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--text-sm);
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}

.note-composer textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.note-save-btn {
  justify-self: end;
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: white;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.note-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notes-empty {
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--color-ink-tertiary);
  font-size: var(--text-sm);
}

.note-item {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  display: grid;
  gap: var(--space-2);
}

.note-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.note-chapter {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-del-btn {
  flex-shrink: 0;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink-tertiary);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}

.note-del-btn:hover {
  color: var(--color-error);
  background: var(--color-error-subtle);
}

.note-content {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--text-sm);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.note-time {
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
}

.notes-drawer-enter-active,
.notes-drawer-leave-active {
  transition: transform 0.25s var(--ease-out-expo), opacity 0.25s ease;
}

.notes-drawer-enter-from,
.notes-drawer-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.read-progress div {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-border);
}

.read-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
}

.lecture-body {
  display: flex;
  flex: 1;
  height: calc(100vh - 57px);
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}

.lecture-page--native .lecture-header {
  position: relative;
}

.lecture-page--native .lecture-body {
  max-width: none;
}

.lecture-page--native .viewer {
  background: #ffffff;
}

/* Sidebar */
.sidebar {
  width: 280px;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--duration-slow) var(--ease-out-expo);
  overflow: hidden;
}

.lecture-body {
  position: relative;
}

/* Floating toggle (outside sidebar, appears when collapsed) */
/* PC floating toggle */
.sidebar-pc-toggle {
  display: none;
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 32px;
  height: 64px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  border: 1px solid var(--color-border);
  border-left: none;
  background: var(--color-surface);
  color: var(--color-ink-tertiary);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  z-index: 100;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.sidebar-pc-toggle--visible {
  display: flex;
}

.sidebar-pc-toggle:hover {
  background: var(--color-ink-secondary);
  color: white;
  border-color: var(--color-ink-secondary);
}

.mobile-sidebar-btn {
  display: none;
}

.sidebar-float-toggle {
  display: none;
  position: absolute;
  top: 50%;
  left: 100%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-ink-tertiary);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  z-index: 100;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.sidebar-float-toggle--visible {
  display: flex;
}

.sidebar-float-toggle:hover {
  background: var(--color-ink-secondary);
  color: white;
  border-color: var(--color-ink-secondary);
}

.sidebar--collapsed {
  width: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

.sidebar--collapsed .sidebar-toggle {
  margin: 0 auto;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-4) var(--space-2);
}

.sidebar-title {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-tertiary);
}

.sidebar--collapsed .sidebar-title {
  display: none;
}

.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--color-ink-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  flex-shrink: 0;
}

.sidebar-toggle:hover {
  background: var(--color-surface);
  color: var(--color-ink-secondary);
}

/* Chapter list */
.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  margin-bottom: var(--space-1);
}

.chapter-item:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}

.chapter-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.chapter-num {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-tertiary);
  min-width: 28px;
}

.chapter-item.active .chapter-num {
  color: var(--color-primary);
}

.chapter-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar--collapsed .chapter-name {
  display: none;
}

/* TOC list */
.toc-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
}

.toc-module {
  margin-bottom: var(--space-2);
}

.toc-module-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  cursor: pointer;
}

.toc-module-title:hover {
  background: var(--color-surface);
}

.toc-module-title.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.toc-module-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-module-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-tertiary);
  flex-shrink: 0;
}

.toc-sections {
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-border);
  margin-left: var(--space-4);
  margin-top: var(--space-1);
}

.toc-section-item {
  display: block;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  margin-bottom: 1px;
  line-height: 1.5;
}

.toc-section-item:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}

.toc-section-item.active {
  color: var(--color-primary);
  font-weight: 500;
}

.sidebar--collapsed .toc-module-text,
.sidebar--collapsed .toc-module-time,
.sidebar--collapsed .toc-sections {
  display: none;
}

/* Viewer */
.viewer {
  flex: 1;
  background: var(--color-surface);
  overflow: hidden;
  position: relative;
}

.viewer-frame {
  width: 100%;
  height: 100%;
  border: none;
}

.viewer-loading {
  padding: var(--space-8);
}

/* Mobile backdrop */
.mobile-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .mobile-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 40;
  }

  .lecture-body {
    position: relative;
  }

  /* Mobile hamburger button (outside sidebar) */
  .mobile-sidebar-btn {
    display: none;
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 200;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-surface);
    color: var(--color-ink-secondary);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-md);
    transition: all var(--duration-fast) var(--ease-out-expo);
  }

  .mobile-sidebar-btn--visible {
    display: flex;
  }

  .mobile-sidebar-btn:active {
    background: var(--color-ink-secondary);
    color: white;
  }

  .sidebar {
    position: absolute;
    z-index: 50;
    height: 100%;
    transform: translateX(0);
    transition: transform var(--duration-slow) var(--ease-out-expo);
  }

  .sidebar--collapsed {
    transform: translateX(-100%);
    width: 280px;
  }

  .lecture-title {
    font-size: var(--text-base);
  }

  .read-progress {
    grid-column: 1 / -1;
    margin-left: 0;
    min-width: 0;
    text-align: left;
  }
}
</style>
