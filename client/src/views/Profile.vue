<template>
  <div class="profile-page">
    <header class="main-header">
      <div class="container header-content">
        <div class="brand">
          <svg class="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.9"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="brand-name">EduManager</span>
        </div>
        <nav class="nav">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/learn" class="nav-link">学习中心</router-link>
          <router-link to="/profile" class="nav-link" style="color: var(--color-primary); font-weight: 600;">学生中心</router-link>
          <button class="nav-link" @click="logout">退出</button>
        </nav>
      </div>
    </header>

    <main class="main-content">
      <div class="container">
        <section class="library-header">
          <div>
            <p class="eyebrow">个人中心</p>
            <h1>学生信息</h1>
          </div>
        </section>

        <div v-if="loading" style="padding: 40px; text-align: center; color: var(--color-ink-tertiary);">加载中...</div>

        <template v-else-if="profile">
          <div class="profile-grid">
            <div class="info-card card">
              <h3 class="card-title">基本信息</h3>
              <div class="info-list">
                <div class="info-row">
                  <span class="info-label">用户名</span>
                  <span class="info-value">{{ profile.username }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">真实姓名</span>
                  <span class="info-value">{{ profile.real_name || '未填写' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">邮箱</span>
                  <span class="info-value">{{ profile.email || '未填写' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">注册时间</span>
                  <span class="info-value">{{ formatDate(profile.created_at) }}</span>
                </div>
              </div>
            </div>

            <div class="info-card card">
              <h3 class="card-title">所属班级</h3>
              <div v-if="profile.groups.length === 0" class="empty-info">暂未分配班级</div>
              <div v-else class="tag-list">
                <span v-for="group in profile.groups" :key="group.id" class="group-tag">{{ group.name }}</span>
              </div>
            </div>

            <div class="info-card card">
              <h3 class="card-title">可访问分类</h3>
              <div v-if="profile.accessibleCategories.length === 0" class="empty-info">暂无可访问分类</div>
              <div v-else class="tag-list">
                <span v-for="cat in profile.accessibleCategories" :key="cat.id" class="category-tag">{{ cat.name }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const profile = ref(null)
const loading = ref(true)

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('studentUsername')
  router.push('/')
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}

onMounted(async () => {
  const token = localStorage.getItem('token')
  if (!token) { router.push('/'); return }
  try {
    const res = await axios.get('/api/auth/student/profile', {
      headers: { Authorization: `Bearer ${token}` }
    })
    profile.value = res.data
  } catch (e) {
    if (e.response?.status === 401) router.push('/')
  } finally {
    loading.value = false
  }
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

.brand { display: flex; align-items: center; gap: var(--space-3); }
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

.main-content { padding-top: var(--space-8); padding-bottom: var(--space-16); }

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

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-6);
}

.info-card { display: flex; flex-direction: column; gap: var(--space-4); }
.card-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
}

.info-list { display: flex; flex-direction: column; gap: var(--space-3); }
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.info-row:last-child { border-bottom: none; }
.info-label { color: var(--color-ink-secondary); font-size: var(--text-sm); }
.info-value { color: var(--color-ink); font-size: var(--text-sm); font-weight: 600; }

.tag-list { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.group-tag {
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.category-tag {
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-brand-subtle);
  color: var(--color-brand);
  font-size: var(--text-sm);
  font-weight: 600;
}

.empty-info { color: var(--color-ink-tertiary); font-size: var(--text-sm); }

@media (max-width: 640px) {
  .header-content { flex-direction: column; gap: var(--space-3); }
  .profile-grid { grid-template-columns: 1fr; }
}
</style>
