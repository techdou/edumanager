<template>
  <div class="home">
    <header class="main-header">
      <div class="container header-content">
        <div class="brand">
          <svg class="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.9"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="brand-name">EduManager</span>
        </div>
        <nav class="nav">
          <template v-if="isLoggedIn">
            <span class="nav-link nav-link--user">{{ studentUsername }}</span>
            <button class="nav-link" @click="logout">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-link">学生登录</router-link>
          </template>
          <router-link to="/admin" class="nav-link nav-link--primary">管理后台</router-link>
        </nav>
      </div>
    </header>

    <main class="container main-content">
      <section class="library-header">
        <div>
          <p class="eyebrow">课程讲义</p>
          <h1>全部学习资料</h1>
        </div>
        <div class="library-meta">
          <strong>{{ lectures.length }}</strong>
          <span>份讲义</span>
        </div>
      </section>

      <section v-if="recentItems.length > 0" class="continue-panel">
        <div class="continue-heading">
          <div>
            <p class="eyebrow">继续学习</p>
            <h2>最近打开</h2>
          </div>
          <button type="button" class="clear-recent" @click="clearRecent">清空</button>
        </div>
        <div class="recent-grid">
          <router-link
            v-for="item in recentItems"
            :key="`${item.lectureSlug}-${item.chapterSlug}`"
            :to="`/lecture/${item.lectureSlug}/${item.chapterSlug}`"
            class="recent-card"
          >
            <div>
              <strong>{{ item.lectureTitle }}</strong>
              <span>{{ item.chapterTitle }}</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <span :style="{ width: `${item.progress || 0}%` }"></span>
            </div>
            <small>{{ item.progress || 0 }}% · {{ formatRecentTime(item.updatedAt) }}</small>
          </router-link>
        </div>
      </section>

      <section v-if="knowledgeDocs.length > 0" class="knowledge-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">飞书知识库</p>
            <h2>知识文档</h2>
          </div>
          <span>{{ knowledgeDocs.length }} 篇</span>
        </div>
        <div class="knowledge-grid">
          <article v-for="doc in knowledgeDocs" :key="doc.id" class="knowledge-card">
            <div class="resource-preview">
              <MarkdownPreview v-if="doc.file_type === 'markdown'" :doc-id="doc.id" />
              <iframe
                v-else
                :src="doc.file_url || doc.url"
                :title="doc.title"
                loading="lazy"
              ></iframe>
              <div class="preview-fallback">
                <span>{{ previewHint(doc) }}</span>
              </div>
            </div>
            <div class="knowledge-body">
              <span class="lecture-category">{{ doc.category_name || '知识文档' }}</span>
              <h3>{{ doc.title }}</h3>
              <p>{{ doc.summary || '管理员暂未填写简介。' }}</p>
              <a :href="doc.file_url || doc.url" target="_blank" rel="noopener noreferrer" class="open-link">
                {{ doc.file_type ? '打开文档' : '打开飞书文档' }}
              </a>
            </div>
          </article>
        </div>
      </section>

      <!-- Category Filters -->
      <div class="filters">
        <button 
          @click="selectedCategory = 'all'" 
          :class="['pill', { active: selectedCategory === 'all' }]"
        >
          全部
        </button>
        <button 
          v-for="cat in categories" 
          :key="cat.id"
          @click="selectedCategory = cat.id"
          :class="['pill', { active: selectedCategory === cat.id }]"
        >
          {{ cat.name }}
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-grid">
        <div v-for="i in 6" :key="i" class="skeleton-card">
          <div class="skeleton" style="height: 24px; width: 60%; margin-bottom: 12px"></div>
          <div class="skeleton" style="height: 16px; width: 40%; margin-bottom: 16px"></div>
          <div class="skeleton-chapters">
            <div class="skeleton" style="height: 28px; width: 80px; border-radius: 999px"></div>
            <div class="skeleton" style="height: 28px; width: 100px; border-radius: 999px"></div>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-else-if="filteredLectures.length === 0" class="empty-state">
        <div class="empty-state-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="16" width="48" height="36" rx="4" fill="oklch(0.9 0.02 260)" stroke="oklch(0.7 0.02 260)" stroke-width="2"/>
            <path d="M8 28H56" stroke="oklch(0.7 0.02 260)" stroke-width="2"/>
            <rect x="14" y="34" width="16" height="4" rx="2" fill="oklch(0.7 0.02 260)" opacity="0.5"/>
            <rect x="14" y="42" width="24" height="4" rx="2" fill="oklch(0.7 0.02 260)" opacity="0.3"/>
            <circle cx="46" cy="46" r="10" fill="oklch(0.95 0.05 35)" stroke="oklch(0.8 0.05 35)" stroke-width="2"/>
            <path d="M42 46H50M46 42V50" stroke="oklch(0.5 0.08 35)" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h3 class="empty-state-title">暂无讲义</h3>
        <p class="empty-state-desc">
          管理员尚未上传任何讲义内容。<br>
          讲义上传后会自动显示在这里。
        </p>
      </div>
      
      <!-- Lecture Grid -->
      <div v-else class="lecture-grid">
        <div v-for="lecture in filteredLectures" :key="lecture.id" class="lecture-card card">
          <div v-if="firstChapterPath(lecture)" class="resource-preview lecture-preview">
            <iframe
              :src="`/lectures/${firstChapterPath(lecture)}/index.html`"
              :title="`${lecture.title} 预览`"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            ></iframe>
            <div class="preview-fade"></div>
          </div>
          <div class="lecture-header">
            <span class="lecture-category">{{ lecture.category_name || '未分类' }}</span>
            <h3 class="lecture-title">{{ lecture.title }}</h3>
            <p class="lecture-meta">{{ lecture.chapters?.length || 0 }} 个章节</p>
          </div>
          
          <div class="chapters">
            <router-link 
              v-for="chapter in lecture.chapters" 
              :key="chapter.id"
              :to="`/lecture/${lecture.slug}/${chapter.slug}`"
              class="chapter-link"
            >
              <span class="chapter-dot"></span>
              {{ chapter.title }}
            </router-link>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const MarkdownPreview = defineAsyncComponent(() => import('../components/MarkdownPreview.vue'))

const categories = ref([])
const lectures = ref([])
const knowledgeDocs = ref([])
const loading = ref(true)
const selectedCategory = ref('all')
const isLoggedIn = ref(!!localStorage.getItem('token'))
const studentUsername = ref(localStorage.getItem('studentUsername') || '')
const recentItems = ref([])

const recentKey = 'edumanager:recentLectures'

function updateLoginState() {
  isLoggedIn.value = !!localStorage.getItem('token')
  studentUsername.value = localStorage.getItem('studentUsername') || ''
  loadRecentItems()
}

function logout() {
  // 清除学生登录态
  localStorage.removeItem('token')
  localStorage.removeItem('studentUsername')
  // 清除管理员登录态（如果有）
  localStorage.removeItem('adminToken')
  updateLoginState()
}

function loadRecentItems() {
  if (!isLoggedIn.value) {
    recentItems.value = []
    return
  }
  try {
    recentItems.value = JSON.parse(localStorage.getItem(recentKey) || '[]').slice(0, 3)
  } catch {
    recentItems.value = []
  }
}

function clearRecent() {
  localStorage.removeItem(recentKey)
  recentItems.value = []
}

function formatRecentTime(value) {
  if (!value) return '刚刚'
  const diff = Date.now() - Number(value)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

function firstChapterPath(lecture) {
  return lecture.chapters?.[0]?.path || ''
}

function previewHint(doc) {
  if (doc.file_type === 'markdown') return 'Markdown / Mermaid 预览'
  if (doc.file_type === 'pdf') return 'PDF 预览'
  return '飞书可能限制内嵌预览'
}

const filteredLectures = computed(() => {
  if (selectedCategory.value === 'all') return lectures.value
  return lectures.value.filter(l => l.category_id === selectedCategory.value)
})

onMounted(async () => {
  const [catRes, lecRes, knowledgeRes] = await Promise.all([
    axios.get('/api/categories'),
    axios.get('/api/lectures'),
    axios.get('/api/knowledge', { params: { featured: 1 } })
  ])
  categories.value = catRes.data
  lectures.value = lecRes.data
  knowledgeDocs.value = knowledgeRes.data
  loading.value = false
  updateLoginState()
  window.addEventListener('storage', updateLoginState)
  window.addEventListener('focus', loadRecentItems)
})

onUnmounted(() => {
  window.removeEventListener('storage', updateLoginState)
  window.removeEventListener('focus', loadRecentItems)
})
</script>

<style scoped>
.main-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: oklch(1 0 0 / 0.85);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-icon {
  color: var(--color-brand);
  flex-shrink: 0;
}

.brand-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-brand);
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  gap: var(--space-2);
}

.nav-link {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.nav-link:hover {
  background: var(--color-bg);
  color: var(--color-ink);
}

.nav-link--primary {
  background: var(--color-primary);
  color: white;
}

.nav-link--primary:hover {
  background: var(--color-primary-hover);
  color: white;
}

.main-content {
  padding-top: var(--space-8);
  padding-bottom: var(--space-16);
}

.library-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.eyebrow {
  color: var(--color-brand);
  font-size: var(--text-xs);
  font-weight: 700;
}

.library-header h1 {
  margin-top: var(--space-1);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  line-height: 1.2;
}

.library-meta {
  min-width: 104px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  text-align: right;
}

.library-meta strong,
.library-meta span {
  display: block;
}

.library-meta strong {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1;
}

.library-meta span {
  margin-top: var(--space-1);
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 700;
}

.filters {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-8);
  flex-wrap: wrap;
}

.continue-panel {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.continue-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.section-heading h2 {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.section-heading > span {
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 800;
}

.continue-heading h2 {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.knowledge-panel {
  margin-bottom: var(--space-8);
}

.knowledge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-5);
}

.knowledge-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.knowledge-body {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}

.knowledge-body h3 {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  line-height: 1.35;
}

.knowledge-body p {
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
}

.open-link {
  justify-self: start;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 800;
  text-decoration: none;
}

.resource-preview {
  position: relative;
  height: 210px;
  overflow: hidden;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}

.resource-preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: white;
}

.lecture-preview iframe {
  transform: scale(0.62);
  transform-origin: top left;
  width: 161.3%;
  height: 161.3%;
  pointer-events: none;
}

.preview-fade {
  position: absolute;
  inset: auto 0 0;
  height: 52px;
  background: linear-gradient(to bottom, transparent, var(--color-surface));
  pointer-events: none;
}

.preview-fallback {
  position: absolute;
  inset: auto var(--space-3) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: oklch(1 0 0 / 0.88);
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 700;
  pointer-events: none;
}

.clear-recent {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
}

.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.recent-card {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-ink);
  text-decoration: none;
}

.recent-card strong,
.recent-card span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-card strong {
  font-size: var(--text-sm);
}

.recent-card span,
.recent-card small {
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
}

.progress-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-border);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-6);
}

.skeleton-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.skeleton-chapters {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.lecture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-6);
}

.lecture-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow: hidden;
  border-radius: 8px;
}

.lecture-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-1);
}

.lecture-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
  line-height: 1.4;
}

.lecture-category {
  align-self: flex-start;
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  background: var(--color-brand-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-brand);
}

.lecture-meta {
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  font-weight: 700;
}

.chapters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0 var(--space-1);
}

.chapter-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  border: 1px solid transparent;
}

.chapter-link:hover {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.chapter-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-muted);
  transition: background var(--duration-fast) var(--ease-out-expo);
}

.chapter-link:hover .chapter-dot {
  background: var(--color-primary);
}

@media (max-width: 640px) {
  .header-content {
    flex-direction: column;
    gap: var(--space-3);
  }

  .library-header {
    align-items: stretch;
    flex-direction: column;
  }

  .library-meta {
    text-align: left;
  }

  .continue-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .recent-grid {
    grid-template-columns: 1fr;
  }

  .knowledge-grid {
    grid-template-columns: 1fr;
  }
  
  .lecture-grid {
    grid-template-columns: 1fr;
  }
}
</style>
