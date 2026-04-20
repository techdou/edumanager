<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="container header-content">
        <div class="brand">
          <span class="brand-icon">🛠️</span>
          <span class="brand-name">管理后台</span>
        </div>
        <nav class="nav">
          <router-link to="/admin/dashboard" class="nav-link">讲义管理</router-link>
          <router-link to="/admin/upload" class="nav-link nav-link--primary">上传讲义</router-link>
          <router-link to="/" class="nav-link">学生端</router-link>
        </nav>
      </div>
    </header>

    <main class="container main-content">
      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ lectures.length }}</div>
          <div class="stat-label">总讲义数</div>
          <div class="stat-trend">{{ lectures.length > 0 ? '+' + lectures.length : '—' }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ totalChapters }}</div>
          <div class="stat-label">总章节</div>
          <div class="stat-trend">{{ totalChapters > 0 ? '+' + totalChapters : '—' }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ categories.length }}</div>
          <div class="stat-label">分类数</div>
          <div class="stat-trend">{{ categories.length > 0 ? categories.length + ' 类' : '—' }}</div>
        </div>
      </div>

      <!-- Categories -->
      <div class="categories-section">
        <div class="section-header">
          <h2 class="section-title">分类管理</h2>
          <div class="inline-add">
            <input v-model="newCategoryName" placeholder="新分类名称" class="input input-sm" @keyup.enter="addCategory" />
            <button class="btn btn-primary btn-sm" @click="addCategory">添加分类</button>
          </div>
        </div>
        <div v-if="categories.length === 0" class="empty-state-sm">暂无分类，请在上方添加</div>
        <div v-else class="category-list">
          <div v-for="cat in categories" :key="cat.id" class="category-item">
            <span class="category-name">{{ cat.name }}</span>
            <button @click="deleteCategory(cat.id)" class="btn btn-ghost btn-sm text-danger">删除</button>
          </div>
        </div>
      </div>

      <!-- Lecture List -->
      <div class="lectures-section">
        <h2 class="section-title">讲义列表</h2>
        
        <!-- Loading -->
        <div v-if="loading" class="skeleton-table">
          <div class="skeleton" style="height: 48px; margin-bottom: 12px"></div>
          <div v-for="i in 5" :key="i" class="skeleton-row">
            <div class="skeleton" style="height: 40px; width: 100%"></div>
          </div>
        </div>
        
        <!-- Empty -->
        <div v-else-if="lectures.length === 0" class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3 class="empty-state-title">暂无讲义</h3>
          <p class="empty-state-desc">上传第一个讲义后，数据将显示在这里</p>
          <div class="empty-state-action">
            <router-link to="/admin/upload" class="btn btn-primary">上传讲义</router-link>
          </div>
        </div>
        
        <!-- Table -->
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>分类</th>
                <th>章节</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lecture in lectures" :key="lecture.id">
                <td class="table-title">
                  <span class="title-text">{{ lecture.title }}</span>
                  <span class="title-slug">{{ lecture.slug }}</span>
                </td>
                <td>
                  <span class="pill">{{ lecture.category_name }}</span>
                </td>
                <td class="table-num">{{ lecture.chapters?.length || 0 }}</td>
                <td class="table-actions">
                  <router-link :to="`/lecture/${lecture.slug}`" class="btn btn-ghost btn-sm">
                    查看
                  </router-link>
                  <button @click="deleteLecture(lecture.id)" class="btn btn-danger btn-sm">
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const lectures = ref([])
const categories = ref([])
const loading = ref(true)

const totalChapters = computed(() => {
  return lectures.value.reduce((sum, l) => sum + (l.chapters?.length || 0), 0)
})

onMounted(async () => {
  const [lecRes, catRes] = await Promise.all([
    axios.get('/api/lectures'),
    axios.get('/api/categories')
  ])
  lectures.value = lecRes.data
  categories.value = catRes.data
  loading.value = false
})

const newCategoryName = ref('')

async function addCategory() {
  if (!newCategoryName.value.trim()) return
  try {
    const res = await axios.post('/api/categories', { name: newCategoryName.value.trim() })
    categories.value.push(res.data)
    newCategoryName.value = ''
  } catch (e) {
    alert('创建失败：' + (e.response?.data?.error || '未知错误'))
  }
}

async function deleteCategory(id) {
  try {
    await axios.delete(`/api/categories/${id}`)
    categories.value = categories.value.filter(c => c.id !== id)
  } catch (e) {
    alert(e.response?.data?.error || '删除失败')
  }
}

async function deleteLecture(id) {
  if (!confirm('删除后无法恢复，确定继续？')) return
  
  try {
    await axios.delete(`/api/lectures/${id}`)
    lectures.value = lectures.value.filter(l => l.id !== id)
  } catch (e) {
    alert('删除失败：' + (e.response?.data?.error || '未知错误'))
  }
}
</script>

<style scoped>
.dashboard-header {
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

.stat-card {
  background: var(--color-surface);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-value {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  font-weight: 600;
}

.stat-trend {
  font-size: var(--text-xs);
  color: var(--color-ink-tertiary);
}

.section-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-6);
}

.skeleton-table {
  padding: var(--space-4);
}

.skeleton-row {
  margin-bottom: var(--space-2);
}

.table-wrapper {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: var(--space-4) var(--space-5);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-tertiary);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.data-table td {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tr:hover td {
  background: oklch(0.98 0.01 260);
}

.table-title {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.title-text {
  font-weight: 600;
  color: var(--color-ink);
}

.title-slug {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-ink-tertiary);
}

.table-num {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-ink-secondary);
}

.table-actions {
  display: flex;
  gap: var(--space-2);
}

.btn-sm {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
}

.categories-section {
  margin-bottom: var(--space-8);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.inline-add {
  display: flex;
  gap: var(--space-2);
}

.input-sm {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  width: 200px;
}

.text-danger {
  color: var(--color-danger, oklch(0.6 0.2 25));
}

.empty-state-sm {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-ink-tertiary);
  font-size: var(--text-sm);
}

.category-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.category-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.category-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .header-content {
    flex-direction: column;
    gap: var(--space-3);
  }
  
  .data-table {
    display: block;
  }
  
  .data-table thead {
    display: none;
  }
  
  .data-table tbody {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }
  
  .data-table tr {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  
  .data-table td {
    padding: 0;
    border: none;
  }
}
</style>