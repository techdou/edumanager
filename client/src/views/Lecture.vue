<template>
  <div class="lecture-page">
    <header class="lecture-header">
      <div class="header-content">
        <router-link to="/" class="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回列表</span>
        </router-link>
        <h1 class="lecture-title">{{ lecture?.title || '讲义浏览' }}</h1>
      </div>
    </header>

    <div class="lecture-body">
      <!-- Mobile hamburger button (shows when sidebar is hidden on mobile) -->
      <button
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
      <aside class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
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
              :class="['toc-module-title', { active: activeAnchor === mod.anchor }]"
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

      <!-- Viewer -->
      <main class="viewer">
        <div v-if="loading" class="viewer-loading">
          <div class="skeleton" style="height: 32px; width: 50%; margin-bottom: 24px"></div>
          <div class="skeleton" style="height: 200px; margin-bottom: 16px"></div>
          <div class="skeleton" style="height: 200px"></div>
        </div>
        
        <iframe 
          v-else-if="currentPath"
          ref="viewerFrame"
          :src="`/lectures/${currentPath}/index.html`"
          class="viewer-frame"
          sandbox="allow-scripts allow-same-origin"
          @load="onIframeLoad"
        />
        
        <div v-else class="empty-state">
          <div class="empty-state-icon">📖</div>
          <h3 class="empty-state-title">选择章节开始阅读</h3>
          <p class="empty-state-desc">从左侧目录选择章节，讲义内容将在此显示</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const slug = computed(() => route.params.slug)
const currentChapter = computed(() => route.params.chapter)
const sidebarCollapsed = ref(false)
const loading = ref(true)
const viewerFrame = ref(null)

const lecture = ref(null)
const chapters = ref([])
const toc = ref(null)
const activeAnchor = ref('')
const showToc = computed(() => !!toc.value && toc.value.modules.length > 0)

const currentPath = computed(() => {
  if (!lecture.value || !currentChapter.value) return null
  return `${slug.value}/${currentChapter.value}`
})

async function loadLecture() {
  loading.value = true
  toc.value = null
  activeAnchor.value = ''
  
  const res = await axios.get('/api/lectures')
  lecture.value = res.data.find(l => l.slug === slug.value)
  chapters.value = lecture.value?.chapters || []
  
  // Try to load TOC for current chapter
  if (currentPath.value) {
    try {
      const [lSlug, cSlug] = currentPath.value.split('/')
      const tocRes = await axios.get(`/api/lectures/toc/${lSlug}/${cSlug}`)
      toc.value = tocRes.data
    } catch {
      toc.value = null
    }
  }
  
  loading.value = false
}

function onIframeLoad() {
  if (!showToc.value || !viewerFrame.value) return
  
  const iframe = viewerFrame.value
  try {
    const doc = iframe.contentDocument
    if (!doc) return
    
    // Inject scroll tracker into iframe
    const script = doc.createElement('script')
    script.textContent = `
      (function() {
        let ticking = false;
        const headings = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id]');
        
        function sendActiveHeading() {
          const scrollTop = window.scrollY || document.documentElement.scrollTop;
          let active = '';
          
          for (let i = headings.length - 1; i >= 0; i--) {
            const el = headings[i];
            const rect = el.getBoundingClientRect();
            if (rect.top <= 120) {
              active = '#' + el.id;
              break;
            }
          }
          
          window.parent.postMessage({ type: 'toc-active', anchor: active }, '*');
        }
        
        window.addEventListener('scroll', function() {
          if (!ticking) {
            ticking = true;
            requestAnimationFrame(function() {
              sendActiveHeading();
              ticking = false;
            });
          }
        });
        
        // Initial call
        sendActiveHeading();
      })();
    `
    doc.head.appendChild(script)
  } catch (e) {
    // Cross-origin or sandbox restriction
  }
}

function scrollToAnchor(anchor) {
  if (!viewerFrame.value) return
  try {
    const doc = viewerFrame.value.contentDocument
    if (!doc) return
    const el = doc.querySelector(anchor)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      activeAnchor.value = anchor
    }
  } catch {
    // fallback: set iframe src with hash
    viewerFrame.value.src = `/lectures/${currentPath.value}/index.html${anchor}`
  }
}

// Listen for scroll messages from iframe
onMounted(() => {
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'toc-active') {
      activeAnchor.value = e.data.anchor
    }
  })
})

onMounted(() => loadLecture())

watch(slug, () => loadLecture())
watch(currentChapter, () => loadLecture())
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

.lecture-body {
  display: flex;
  flex: 1;
  height: calc(100vh - 57px);
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
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
.sidebar-float-toggle {
  display: none;
  position: absolute;
  top: 50%;
  left: 100%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-ink-divider);
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
  width: 48px;
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

@media (max-width: 768px) {
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
}
</style>
