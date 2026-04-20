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
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
        <div class="sidebar-header">
          <h3 class="sidebar-title">章节目录</h3>
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
        
        <nav class="chapter-list">
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
          :src="`/lectures/${currentPath}/index.html`"
          class="viewer-frame"
          sandbox="allow-scripts allow-same-origin"
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const slug = computed(() => route.params.slug)
const currentChapter = computed(() => route.params.chapter)
const sidebarCollapsed = ref(false)
const loading = ref(true)

const lecture = ref(null)
const chapters = ref([])
const currentPath = computed(() => {
  if (!lecture.value || !currentChapter.value) return null
  return `${slug.value}/${currentChapter.value}`
})

onMounted(async () => {
  loading.value = true
  const res = await axios.get('/api/lectures')
  lecture.value = res.data.find(l => l.slug === slug.value)
  chapters.value = lecture.value?.chapters || []
  loading.value = false
})

watch(slug, async () => {
  loading.value = true
  const res = await axios.get('/api/lectures')
  lecture.value = res.data.find(l => l.slug === slug.value)
  chapters.value = lecture.value?.chapters || []
  loading.value = false
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

.sidebar--collapsed {
  width: 48px;
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