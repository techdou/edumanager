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
            <router-link to="/learn" class="nav-link">学习中心</router-link>
            <router-link to="/profile" class="nav-link nav-link--user">{{ studentUsername }}</router-link>
            <button class="nav-link" @click="logout">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-link">学生登录</router-link>
          </template>
          <router-link to="/admin" class="nav-link nav-link--primary">管理后台</router-link>
        </nav>
      </div>
    </header>

    <!-- Login Tip Toast -->
    <Transition name="toast">
      <div v-if="loginTipVisible" class="login-tip">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>请先登录学生账号</span>
        <router-link to="/login" class="login-tip-btn">去登录</router-link>
      </div>
    </Transition>

    <main class="main-content">
      <!-- Hero Section -->
      <section class="hero">
        <div class="hero-glow"></div>
        <div class="hero-glow-secondary"></div>
        <div class="container hero-inner">
          <div class="hero-text">
            <p class="hero-eyebrow">🎓 智慧教育平台</p>
            <h1 class="hero-title">
              让教学资源管理<br><span class="hero-gradient">更高效、更有序</span>
            </h1>
            <p class="hero-desc">
              EduManager 为教育机构提供一站式讲义管理解决方案。<br class="hide-mobile">上传、分类、分发课程资料，学生随时随地在线学习。
            </p>
            <div class="hero-actions">
              <router-link v-if="!isLoggedIn" to="/register" class="hero-btn hero-btn--primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                开始使用
              </router-link>
              <router-link v-else to="/learn" class="hero-btn hero-btn--primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                进入学习
              </router-link>
              <router-link to="/admin" class="hero-btn hero-btn--ghost">
                管理后台 →
              </router-link>
            </div>
          </div>
          <div class="hero-bento">
            <div class="bento-card bento-card--accent">
              <div class="bento-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h3>讲义管理</h3>
              <p>上传 ZIP 讲义包，自动解析章节目录，支持分类与封面</p>
            </div>
            <div class="bento-card">
              <div class="bento-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </div>
              <h3>在线学习</h3>
              <p>在线浏览讲义，目录导航，阅读进度跟踪</p>
            </div>
            <div class="bento-card">
              <div class="bento-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </div>
              <h3>知识库</h3>
              <p>整合飞书文档，Markdown/PDF 在线预览</p>
            </div>
            <div class="bento-card">
              <div class="bento-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3>用户管理</h3>
              <p>管理员与学员角色分离，数据统计一目了然</p>
            </div>
          </div>
        </div>
        <!-- Hero → Content 过渡衔接 -->
        <div class="hero-bridge">
          <div class="bridge-line"></div>
          <div class="bridge-stats">
            <div class="bridge-stat">
              <strong>{{ lectures.length }}</strong>
              <span>份讲义</span>
            </div>
            <div class="bridge-divider"></div>
            <div class="bridge-stat">
              <strong>{{ categories.length }}</strong>
              <span>个分类</span>
            </div>
            <div class="bridge-divider"></div>
            <div class="bridge-stat">
              <strong>{{ totalChapters }}</strong>
              <span>个章节</span>
            </div>
          </div>
          <div class="bridge-line"></div>
        </div>
      </section>

      <div class="container">
      <section class="library-header">
        <div>
          <p class="eyebrow">课程讲义</p>
          <h1 v-if="!isLoggedIn">公开精选</h1>
          <h1 v-else>全部学习资料</h1>
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
              <img
                v-if="doc.cover_url"
                class="cover-image"
                :src="doc.cover_url"
                :alt="`${doc.title} 封面`"
                loading="lazy"
              />
              <MarkdownPreview v-else-if="doc.file_type === 'markdown'" :doc-id="doc.id" />
              <iframe
                v-else-if="doc.file_type === 'pdf'"
                :src="doc.file_url || doc.url"
                :title="doc.title"
                loading="lazy"
              ></iframe>
              <div v-else class="external-preview">
                <span class="external-preview-badge">{{ docHost(doc.url) }}</span>
                <strong>{{ doc.title }}</strong>
                <p>{{ doc.summary || '飞书网页通常不允许 iframe 内嵌，这里展示文档简介并提供安全跳转。' }}</p>
              </div>
              <div v-if="doc.file_type && !doc.cover_url" class="preview-fallback">
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
          <div v-if="lecture.cover_url || firstChapterSrc(lecture)" class="resource-preview lecture-preview">
            <img
              v-if="lecture.cover_url"
              class="cover-image"
              :src="lecture.cover_url"
              :alt="`${lecture.title} 封面`"
              loading="lazy"
            />
            <iframe
              v-else
              :src="firstChapterSrc(lecture)"
              :title="`${lecture.title} 预览`"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            ></iframe>
            <div class="preview-fade"></div>
            <div v-if="!isLoggedIn" class="preview-lock" @click="showLoginTip">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>登录后查看</span>
            </div>
          </div>
          <div class="lecture-header">
            <span class="lecture-category">{{ lecture.category_name || '未分类' }}</span>
            <h3 class="lecture-title">{{ lecture.title }}</h3>
            <p class="lecture-meta">{{ lecture.chapters?.length || 0 }} 个章节</p>
          </div>
          
          <div class="chapters">
            <a 
              v-for="chapter in lecture.chapters" 
              :key="chapter.id"
              class="chapter-link"
              @click.prevent="goLecture(lecture.slug, chapter.slug)"
            >
              <span class="chapter-dot"></span>
              {{ chapter.title }}
            </a>
          </div>
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

const recentKeyPrefix = 'edumanager:recentLectures'
const loginTipVisible = ref(false)
let loginTipTimer = null

function currentUserKey() {
  const token = localStorage.getItem('token')
  if (!token) return 'guest'
  try {
    return JSON.parse(atob(token.split('.')[1])).id || localStorage.getItem('studentUsername') || 'student'
  } catch {
    return localStorage.getItem('studentUsername') || 'student'
  }
}

function recentKey() {
  return `${recentKeyPrefix}:${currentUserKey()}`
}

function updateLoginState() {
  isLoggedIn.value = !!localStorage.getItem('token')
  studentUsername.value = localStorage.getItem('studentUsername') || ''
  loadRecentItems()
}

function showLoginTip() {
  loginTipVisible.value = true
  clearTimeout(loginTipTimer)
  loginTipTimer = setTimeout(() => { loginTipVisible.value = false }, 3000)
}

function goLecture(lectureSlug, chapterSlug) {
  if (!isLoggedIn.value) {
    showLoginTip()
    return
  }
  window.location.href = `/lecture/${lectureSlug}/${chapterSlug}`
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
    recentItems.value = JSON.parse(
      localStorage.getItem(recentKey())
      || localStorage.getItem(recentKeyPrefix)
      || '[]'
    ).slice(0, 3)
  } catch {
    recentItems.value = []
  }
}

function clearRecent() {
  localStorage.removeItem(recentKey())
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

function firstChapterSrc(lecture) {
  const chapter = lecture.chapters?.[0]
  if (!chapter?.path) return ''
  const token = localStorage.getItem('token')
  const query = token ? `?access_token=${encodeURIComponent(token)}` : ''
  return `/lectures/${chapter.path}/${chapter.entry_file || 'index.html'}${query}`
}

function previewHint(doc) {
  if (doc.file_type === 'markdown') return 'Markdown / Mermaid 预览'
  if (doc.file_type === 'pdf') return 'PDF 预览'
  return '文档预览'
}

function docHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '外部知识库'
  }
}

const filteredLectures = computed(() => {
  if (selectedCategory.value === 'all') return lectures.value
  return lectures.value.filter(l => l.category_id === selectedCategory.value)
})

const totalChapters = computed(() => lectures.value.reduce((s, l) => s + (l.chapters?.length || 0), 0))

onMounted(async () => {
  const token = localStorage.getItem('token')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const [catRes, lecRes, knowledgeRes] = await Promise.all([
    axios.get('/api/categories'),
    axios.get('/api/lectures', { headers }),
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
/* ====== Login Tip Toast ====== */
.login-tip {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: oklch(0.15 0.03 250);
  color: white;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 8px 32px oklch(0.15 0.03 250 / 0.3);
}

.login-tip-btn {
  padding: 4px 14px;
  background: oklch(0.55 0.18 250);
  color: white;
  border-radius: 8px;
  font-weight: 700;
  font-size: 13px;
  text-decoration: none;
}

.login-tip-btn:hover {
  background: oklch(0.5 0.2 250);
}

.toast-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* ====== Preview Lock Overlay ====== */
.preview-lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: oklch(1 0 0 / 0.75);
  backdrop-filter: blur(4px);
  color: var(--color-ink-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out-expo);
}

.lecture-card:hover .preview-lock {
  opacity: 1;
}

/* ====== Hero Section ====== */
.hero {
  position: relative;
  overflow: hidden;
  padding: var(--space-16) 0 0;
  background: linear-gradient(180deg, oklch(0.98 0.01 250) 0%, var(--color-surface) 100%);
}

.hero-glow {
  position: absolute;
  top: -30%;
  right: -5%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, oklch(0.6 0.18 250 / 0.1) 0%, transparent 70%);
  pointer-events: none;
}

.hero-glow-secondary {
  position: absolute;
  top: 10%;
  left: -8%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, oklch(0.6 0.15 35 / 0.06) 0%, transparent 65%);
  pointer-events: none;
}

.hero::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 10%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, oklch(0.55 0.15 280 / 0.05) 0%, transparent 70%);
  pointer-events: none;
}

.hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
  align-items: center;
}

.hero-text {
  display: grid;
  gap: var(--space-5);
}

.hero-eyebrow {
  color: var(--color-brand);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.hero-title {
  font-family: 'Sora', 'DM Sans', system-ui, sans-serif;
  font-size: clamp(34px, 4.5vw, 52px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.04em;
  color: var(--color-ink);
}

.hero-gradient {
  background: linear-gradient(135deg, oklch(0.5 0.2 250), oklch(0.6 0.18 280), oklch(0.55 0.15 35));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-desc {
  font-size: var(--text-base);
  line-height: 1.75;
  color: var(--color-ink-secondary);
  max-width: 480px;
}

.hide-mobile { display: inline; }

@media (max-width: 640px) {
  .hide-mobile { display: none; }
}

.hero-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.hero-btn--primary {
  background: var(--color-primary);
  color: white;
  box-shadow: 0 4px 16px oklch(0.55 0.18 250 / 0.25);
}

.hero-btn--primary:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px oklch(0.55 0.18 250 / 0.3);
  color: white;
}

.hero-btn--ghost {
  color: var(--color-ink-secondary);
  padding: var(--space-3) var(--space-4);
}

.hero-btn--ghost:hover {
  color: var(--color-primary);
}

/* Bento Grid */
.hero-bento {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.bento-card {
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  transition: all var(--duration-normal) var(--ease-out-expo);
}

.bento-card:hover {
  border-color: oklch(0.8 0.04 250);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.bento-card--accent {
  background: linear-gradient(135deg, oklch(0.95 0.04 250), oklch(0.97 0.02 250));
  border-color: oklch(0.85 0.06 250);
}

.bento-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-primary);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.bento-card--accent .bento-icon {
  background: var(--color-primary);
  color: white;
}

.bento-card h3 {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-2);
}

.bento-card p {
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--color-ink-tertiary);
}

/* Hero → Content Bridge */
.hero-bridge {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  max-width: 1280px;
  margin: var(--space-10) auto var(--space-8);
  padding: 0 var(--space-6);
}

.bridge-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-border), transparent);
}

.bridge-stats {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.bridge-stat {
  text-align: center;
}

.bridge-stat strong {
  display: block;
  font-family: 'Sora', system-ui, sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
}

.bridge-stat span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-tertiary);
  letter-spacing: 0.04em;
}

.bridge-divider {
  width: 1px;
  height: 32px;
  background: var(--color-border);
}

@media (max-width: 900px) {
  .hero-inner {
    grid-template-columns: 1fr;
    gap: var(--space-8);
  }

  .hero-bento {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .hero {
    padding: var(--space-10) 0 0;
  }

  .hero-bento {
    grid-template-columns: 1fr;
  }

  .bridge-stats {
    gap: var(--space-4);
  }

  .bridge-stat strong {
    font-size: 20px;
  }
}

/* ====== Original Styles ====== */
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

.cover-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: var(--color-bg);
}

.external-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-5);
  background:
    linear-gradient(135deg, oklch(0.98 0.02 225), oklch(0.98 0.02 150)),
    var(--color-surface);
}

.external-preview-badge {
  align-self: flex-start;
  max-width: 100%;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: oklch(1 0 0 / 0.78);
  color: var(--color-brand);
  font-size: var(--text-xs);
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.external-preview strong {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  line-height: 1.35;
}

.external-preview p {
  display: -webkit-box;
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  line-height: 1.55;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
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
