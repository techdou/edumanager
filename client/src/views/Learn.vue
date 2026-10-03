<template>
  <div class="learn-page">
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
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/learn" class="nav-link" style="color: var(--color-primary); font-weight: 600;">学习中心</router-link>
          <router-link to="/profile" class="nav-link">{{ studentUsername }}</router-link>
          <button class="nav-link" @click="logout">退出</button>
        </nav>
      </div>
    </header>

    <main class="main-content">
      <div class="container">
        <section class="library-header">
          <div>
            <p class="eyebrow">学习中心</p>
            <h1>我的课程</h1>
          </div>
          <div class="library-meta">
            <strong>{{ lectures.length }}</strong>
            <span>份讲义</span>
          </div>
        </section>

        <label class="search-field">搜索讲义、分类或章节<input v-model="search" type="search" placeholder="输入标题、分类或章节名称" /></label>
        <section class="continue-panel">
          <h2>继续学习</h2>
          <p v-if="progressLoading" role="status">正在同步学习记录...</p>
          <p v-if="progressError" role="alert">{{ progressError }} <button @click="refreshProgress" :disabled="progressLoading">重试同步</button></p>
          <router-link v-for="item in continueItems" :key="`${item.lectureSlug}/${item.chapterSlug}`" :to="chapterUrl(item.lectureSlug, item.chapterSlug)" class="chapter-link">{{ item.lectureTitle }} · {{ item.chapterTitle }} · 阅读位置 {{ item.progress }}% · {{ item.completed ? '已完成' : '未完成' }}</router-link>
          <p v-if="!progressLoading && !continueItems.length && !progressError">打开一个章节开始学习，记录会随账号同步。</p>
        </section>
        <div v-if="error" class="module-error" role="alert">{{ error }} <button @click="loadLectures" :disabled="loading">重试</button></div>
        <div v-if="loading" class="loading-grid">
          <div v-for="i in 6" :key="i" class="skeleton-card">
            <div class="skeleton" style="height: 24px; width: 60%; margin-bottom: 12px"></div>
            <div class="skeleton" style="height: 16px; width: 40%; margin-bottom: 16px"></div>
          </div>
        </div>

        <div v-else-if="!error && filteredLectures.length === 0" class="empty-state">
          <div class="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="16" width="48" height="36" rx="4" fill="oklch(0.9 0.02 260)" stroke="oklch(0.7 0.02 260)" stroke-width="2"/><path d="M8 28H56" stroke="oklch(0.7 0.02 260)" stroke-width="2"/><rect x="14" y="34" width="16" height="4" rx="2" fill="oklch(0.7 0.02 260)" opacity="0.5"/></svg>
          </div>
          <h3 class="empty-state-title">{{ search ? '没有匹配的讲义或章节' : '暂无可学习内容' }}</h3>
          <p class="empty-state-desc">您所在的班级暂无可访问的讲义，请联系管理员。</p>
        </div>

        <template v-else>
          <section v-for="group in groupedLectures" :key="group.categoryName" class="category-section">
            <h2 class="category-title">{{ group.categoryName }}</h2>
            <div class="lecture-grid">
              <div v-for="lecture in group.lectures" :key="lecture.id" class="lecture-card card">
                <div v-if="lecture.cover_url" class="resource-preview lecture-preview"><img class="cover-image" :src="lecture.cover_url" :alt="`${lecture.title} 封面`" loading="lazy" /></div>
                <div class="lecture-header">
                  <span class="lecture-category">{{ lecture.category_name || '未分类' }}</span>
                  <h3 class="lecture-title">{{ lecture.title }}</h3>
                  <p class="lecture-meta">{{ lecture.chapters?.length || 0 }} 个章节</p>
                </div>
                <div class="chapters">
                  <router-link
                    v-for="chapter in lecture.chapters"
                    :key="chapter.id"
                    :to="chapterUrl(lecture.slug, chapter.slug)"
                    class="chapter-link"
                  >
                    <span class="chapter-dot"></span>
                    {{ chapter.title }}{{ chapterStatus(chapter) }}
                  </router-link>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../lib/http'
import { ensureContentSession, logoutSession } from '../lib/contentSession'
import { cachedProgress, loadProgress } from '../lib/progress'
import { chapterUrl, searchLectures } from '../lib/learning.mjs'
const router = useRouter()
const lectures = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const progress = ref([])
const progressError = ref('')
const progressLoading = ref(false)
const studentUsername = ref(localStorage.getItem('studentUsername') || '')
function updateLoginState() { studentUsername.value = localStorage.getItem('studentUsername') || '' }
async function logout() { try { await logoutSession() } finally { router.push('/') } }
async function loadLectures() {
  loading.value = true; error.value = ''
  try { await ensureContentSession(); lectures.value = (await api.get('/api/lectures/my')).data }
  catch { error.value = '课程加载失败，请检查连接后重试。' }
  finally { loading.value = false }
}
async function refreshProgress() {
  progressLoading.value = true; progressError.value = ''
  try { progress.value = await loadProgress() }
  catch { progress.value = cachedProgress(); progressError.value = '学习记录同步失败，当前显示此设备缓存。' }
  finally { progressLoading.value = false }
}
const filteredLectures = computed(() => searchLectures(lectures.value, search.value))
const groupedLectures = computed(() => {
  const map = new Map()
  for (const lecture of filteredLectures.value) {
    const name = lecture.category_name || '未分类'
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(lecture)
  }
  return [...map.entries()].map(([categoryName, lectures]) => ({ categoryName, lectures }))
})
const continueItems = computed(() => progress.value.filter(item => lectures.value.some(lecture => lecture.id === item.lecture_id || lecture.slug === item.lectureSlug)).slice(0, 3))
function chapterStatus(chapter) { return progress.value.find(item => Number(item.chapter_id) === Number(chapter.id))?.completed ? ' · 已完成' : '' }
onMounted(() => {
  Promise.allSettled([loadLectures(), refreshProgress()])
  window.addEventListener('storage', updateLoginState)
  window.addEventListener('auth-changed', updateLoginState)
})
onUnmounted(() => { window.removeEventListener('storage', updateLoginState); window.removeEventListener('auth-changed', updateLoginState) })
</script>

<style scoped>
.search-field { display: grid; gap: 8px; margin-bottom: 20px; }
.search-field input { padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; font: inherit; }
.continue-panel { padding: 20px; margin: 20px 0; border: 1px solid var(--color-border); border-radius: 8px; }
.continue-panel h2 { margin-bottom: 12px; }
.module-error { padding: 16px; background: #fff4ed; margin: 16px 0; }
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

.brand-icon { color: var(--color-brand); flex-shrink: 0; }

.brand-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-brand);
  letter-spacing: -0.02em;
}

.nav { display: flex; gap: var(--space-2); }

.nav-link {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.nav-link:hover { background: var(--color-bg); color: var(--color-ink); }

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

.eyebrow { color: var(--color-brand); font-size: var(--text-xs); font-weight: 700; }

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

.library-meta strong, .library-meta span { display: block; }
.library-meta strong { font-family: var(--font-display); font-size: var(--text-2xl); line-height: 1; }
.library-meta span { margin-top: var(--space-1); color: var(--color-ink-tertiary); font-size: var(--text-xs); font-weight: 700; }

.category-section { margin-bottom: var(--space-10); }
.category-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-5);
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

.lecture-meta { color: var(--color-ink-tertiary); font-size: var(--text-xs); font-weight: 700; }

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

.cover-image { width: 100%; height: 100%; display: block; object-fit: cover; background: var(--color-bg); }

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

.chapters { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0 var(--space-1); }

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

.chapter-link:hover { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary); }

.chapter-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-muted);
  transition: background var(--duration-fast) var(--ease-out-expo);
}

.chapter-link:hover .chapter-dot { background: var(--color-primary); }

@media (max-width: 640px) {
  .header-content { flex-direction: column; gap: var(--space-3); }
  .library-header { align-items: stretch; flex-direction: column; }
  .library-meta { text-align: left; }
  .lecture-grid { grid-template-columns: 1fr; }
}
</style>
