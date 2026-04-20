<template>
  <div class="home">
    <header class="main-header">
      <div class="container header-content">
        <div class="brand">
          <span class="brand-icon">📚</span>
          <span class="brand-name">EduManager</span>
        </div>
        <nav class="nav">
          <router-link to="/login" class="nav-link">学生登录</router-link>
          <router-link to="/admin" class="nav-link nav-link--primary">管理后台</router-link>
        </nav>
      </div>
    </header>

    <main class="container main-content">
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
        <div class="empty-state-icon">📭</div>
        <h3 class="empty-state-title">暂无讲义</h3>
        <p class="empty-state-desc">
          管理员尚未上传任何讲义内容。<br>
          讲义上传后会自动显示在这里。
        </p>
      </div>
      
      <!-- Lecture Grid -->
      <div v-else class="lecture-grid">
        <div v-for="lecture in filteredLectures" :key="lecture.id" class="lecture-card card">
          <div class="lecture-header">
            <h3 class="lecture-title">{{ lecture.title }}</h3>
            <span class="lecture-category">{{ lecture.category_name }}</span>
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
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const categories = ref([])
const lectures = ref([])
const loading = ref(true)
const selectedCategory = ref('all')

const filteredLectures = computed(() => {
  if (selectedCategory.value === 'all') return lectures.value
  return lectures.value.filter(l => l.category_id === selectedCategory.value)
})

onMounted(async () => {
  const [catRes, lecRes] = await Promise.all([
    axios.get('/api/categories'),
    axios.get('/api/lectures')
  ])
  categories.value = catRes.data
  lectures.value = lecRes.data
  loading.value = false
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
  font-size: var(--text-xl);
}

.brand-name {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
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

.filters {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-8);
  flex-wrap: wrap;
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
}

.lecture-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.lecture-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
  line-height: 1.4;
}

.lecture-category {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chapters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
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
  
  .lecture-grid {
    grid-template-columns: 1fr;
  }
}
</style>