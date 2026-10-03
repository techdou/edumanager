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
        <button v-if="currentPath && !iframeError" class="completion-button" :disabled="savingCompletion" @click="markComplete">{{ completed ? '已完成 · 取消标记' : '标记本章已完成' }}</button>
        <div v-if="currentPath && !nativeLayout" class="read-progress">
          <span>阅读位置 {{ readProgress }}%</span>
          <div><i :style="{ width: `${readProgress}%` }"></i></div>
        </div>
      </div>
    </header>

    <div v-if="syncError" role="status" class="sync-error">{{ syncError }} <button @click="retryProgress">重试同步</button></div>
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
        
        <div v-else-if="iframeError" class="empty-state" role="alert">
          <h3 class="empty-state-title">讲义暂时无法打开</h3>
          <p class="empty-state-desc">{{ loadError || '请检查连接后重试，或联系管理员。' }}</p>
          <button class="completion-button" @click="loadLecture">重新加载讲义</button>
          <router-link v-if="!getToken()" :to="loginLocation()">登录后重试</router-link>
        </div>
        <iframe v-else-if="currentSrc" :key="frameKey" ref="viewerFrame" :src="currentSrc" class="viewer-frame" title="讲义内容" sandbox="allow-scripts allow-same-site-none-cookies" @load="onIframeLoad" @error="iframeError = true" />
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/http'
import { ensureContentSession } from '../lib/contentSession'
import { getToken, authHeaders, loginLocation } from '../lib/auth'
import { cachedProgress, loadProgress, cacheProgress, saveProgress } from '../lib/progress'
const route = useRoute()
const slug = computed(() => route.params.slug)
const currentChapter = computed(() => route.params.chapter || chapters.value[0]?.slug || '')
const sidebarCollapsed = ref(false)
const isMobile = ref(window.innerWidth <= 768)
const loading = ref(true)
const viewerFrame = ref(null)
const iframeError = ref(false)
const loadError = ref('')
const lecture = ref(null)
const chapters = ref([])
const toc = ref(null)
const activeAnchor = ref('')
const readProgress = ref(0)
const completed = ref(false)
const savingCompletion = ref(false)
const syncError = ref('')
const ready = ref(false)
const frameKey = ref(0)
const showToc = computed(() => !!toc.value?.modules?.length)
const nativeLayout = computed(() => lecture.value?.layout_mode === 'native')
const chapter = computed(() => chapters.value.find(item => item.slug === currentChapter.value))
const currentPath = computed(() => chapter.value?.path || '')
const currentSrc = computed(() => ready.value && chapter.value ? `/lectures/${chapter.value.path}/${chapter.value.entry_file || 'index.html'}` : '')
let requestVersion = 0
let controller = null
let saveTimer = null
let sessionTimer = null
let frameTimer = null
let pendingProgress = null
let saveChain = Promise.resolve()

function syncViewportMode() { isMobile.value = window.innerWidth <= 768; if (isMobile.value) sidebarCollapsed.value = true }
function snapshot() {
  if (!lecture.value || !chapter.value) return null
  return { lecture_id: lecture.value.id, chapter_id: chapter.value.id, lectureSlug: slug.value, chapterSlug: chapter.value.slug, lectureTitle: lecture.value.title, chapterTitle: chapter.value.title, progress: readProgress.value, completed: completed.value, updatedAt: Date.now() }
}
function persist(item, complete) {
  if (!item || !getToken()) return Promise.resolve()
  const token = getToken()
  // Serialize writes so an older slow save cannot overwrite a newer reading position.
  saveChain = saveChain.catch(() => {}).then(() => saveProgress(item, complete, token))
  return saveChain
}
function scheduleSave() {
  const item = snapshot()
  if (!item || !getToken()) return
  cacheProgress(item)
  pendingProgress = item
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushProgress, 1200)
}
function flushProgress() {
  clearTimeout(saveTimer)
  const item = pendingProgress
  pendingProgress = null
  if (!item) return
  const version = requestVersion
  persist(item).then(() => { if (version === requestVersion) syncError.value = '' }).catch(() => {
    if (version === requestVersion) syncError.value = '进度尚未同步，已保存在此设备。'
  })
}
async function retryProgress() {
  const item = snapshot()
  try { await persist(item, completed.value); syncError.value = '' }
  catch { syncError.value = '进度同步失败，请稍后重试。' }
}
async function markComplete() {
  if (!getToken()) { window.location.assign(loginLocation()); return }
  if (savingCompletion.value) return
  const version = requestVersion
  const next = !completed.value
  const item = { ...snapshot(), completed: next }
  savingCompletion.value = true
  flushProgress()
  try { await persist(item, next); if (version === requestVersion) { completed.value = next; syncError.value = '' } }
  catch { if (version === requestVersion) syncError.value = '完成状态未同步，请重试。' }
  finally { if (version === requestVersion) savingCompletion.value = false }
}
function postToFrame(message) { viewerFrame.value?.contentWindow?.postMessage(message, '*') }
function restoreFrame() { postToFrame({ type: 'restore-progress', progress: readProgress.value }) }
function handleTocMessage(event) {
  if (event.source !== viewerFrame.value?.contentWindow) return
  if (event.data?.type === 'reading-ready') { clearTimeout(frameTimer); restoreFrame() }
  if (event.data?.type === 'toc-active') activeAnchor.value = String(event.data.anchor || '')
  if (event.data?.type === 'reading-progress') {
    readProgress.value = Math.max(0, Math.min(100, Math.round(Number(event.data.progress) || 0)))
    scheduleSave()
  }
}
function onIframeLoad() { restoreFrame() }
function scrollToAnchor(anchor) { postToFrame({ type: 'scroll-to-anchor', anchor }); if (isMobile.value) sidebarCollapsed.value = true }
function isModuleActive(module) { return activeAnchor.value === module.anchor || module.sections?.some(section => section.anchor === activeAnchor.value) }

async function loadLecture() {
  flushProgress()
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  const version = ++requestVersion
  const requestedSlug = String(route.params.slug || '')
  const requestedChapter = String(route.params.chapter || '')
  ready.value = false; loading.value = true; iframeError.value = false; loadError.value = ''; syncError.value = ''; toc.value = null
  activeAnchor.value = ''; readProgress.value = 0; completed.value = false; savingCompletion.value = false
  clearTimeout(frameTimer)
  try {
    const { data } = await api.get('/api/lectures', { signal })
    if (version !== requestVersion) return
    lecture.value = (Array.isArray(data) ? data : []).find(item => item.slug === requestedSlug) || null
    chapters.value = lecture.value?.chapters || []
    if (!lecture.value || !chapters.value.length || (requestedChapter && !chapters.value.some(item => item.slug === requestedChapter))) throw new Error('讲义或章节不存在，或当前账号没有访问权限。')
    let rows
    try { rows = await loadProgress() }
    catch { rows = cachedProgress(); if (version === requestVersion) syncError.value = '学习记录暂未同步，使用此设备缓存。' }
    if (version !== requestVersion) return
    const saved = rows.find(item => Number(item.chapter_id) === chapter.value.id || (item.lectureSlug === requestedSlug && item.chapterSlug === chapter.value.slug))
    readProgress.value = Number(saved?.progress) || 0
    completed.value = Boolean(saved?.completed)
    await ensureContentSession()
    if (version !== requestVersion) return
    const entryUrl = `/lectures/${chapter.value.path}/${chapter.value.entry_file || 'index.html'}`
    await api.head(entryUrl, { signal, silent: true })
    if (version !== requestVersion) return
    ready.value = true; frameKey.value += 1
    frameTimer = setTimeout(() => { if (version === requestVersion) { iframeError.value = true; loadError.value = '讲义加载超时，请重新打开。' } }, 30000)
    if (!nativeLayout.value) {
      api.get(`/api/lectures/toc/${encodeURIComponent(requestedSlug)}/${encodeURIComponent(chapter.value.slug)}`, { signal, silent: true }).then(({ data }) => {
        if (version === requestVersion) toc.value = data?.modules ? data : null
      }).catch(() => {})
    }
  } catch (error) {
    if (version !== requestVersion || signal.aborted) return
    iframeError.value = true
    loadError.value = error.response?.status === 403 ? '当前账号没有访问该讲义的权限。' : error.response?.status === 404 ? '讲义文件不存在，请联系管理员。' : error.message === 'Network Error' ? '网络连接失败，请重试。' : error.response?.data?.error || error.message || '讲义加载失败，请重试。'
  } finally { if (version === requestVersion) loading.value = false }
}
function saveBeforeLeaving() {
  const item = pendingProgress
  if (!item || !getToken()) return
  cacheProgress(item)
  fetch(`/api/progress/${item.lecture_id}/${item.chapter_id}`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ position: item.progress }), keepalive: true }).catch(() => {})
}
onMounted(() => {
  syncViewportMode(); sidebarCollapsed.value = isMobile.value
  window.addEventListener('resize', syncViewportMode)
  window.addEventListener('message', handleTocMessage)
  window.addEventListener('pagehide', saveBeforeLeaving)
  sessionTimer = setInterval(() => ensureContentSession().catch(() => { syncError.value = '内容会话刷新失败，请检查网络。' }), 20 * 60 * 1000)
  loadLecture()
})
onUnmounted(() => {
  flushProgress(); requestVersion += 1; controller?.abort(); clearInterval(sessionTimer); clearTimeout(frameTimer)
  window.removeEventListener('resize', syncViewportMode); window.removeEventListener('message', handleTocMessage); window.removeEventListener('pagehide', saveBeforeLeaving)
})
watch(() => [route.params.slug, route.params.chapter], loadLecture)
</script>

<style scoped>
.completion-button { padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); color: var(--color-brand); cursor: pointer; font: inherit; }
.sync-error { padding: 10px 24px; background: #fff4ed; }
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
  margin-left: auto;
  min-width: 140px;
  display: grid;
  gap: 5px;
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: right;
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
