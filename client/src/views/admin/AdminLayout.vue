<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <router-link to="/admin/dashboard" class="brand">
        <span class="brand-mark">E</span>
        <span>
          <strong>EduManager</strong>
          <small>管理端</small>
        </span>
      </router-link>

      <nav class="admin-nav" aria-label="后台导航">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-link"
        >
          <span class="nav-dot"></span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <router-link to="/" class="admin-nav-link secondary">学生端</router-link>
        <button type="button" class="logout-button" @click="logout">退出登录</button>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div>
          <p class="eyebrow">后台管理</p>
          <h1>{{ pageTitle }}</h1>
        </div>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const navItems = [
  { label: '仪表盘', to: '/admin/dashboard' },
  { label: '用户管理', to: '/admin/users' },
  { label: '班级管理', to: '/admin/groups' },
  { label: '分类管理', to: '/admin/categories' },
  { label: '讲义管理', to: '/admin/lectures' },
  { label: '知识文档', to: '/admin/knowledge' }
]

const pageTitle = computed(() => {
  const matched = navItems.find(item => route.path.startsWith(item.to))
  if (route.path === '/admin/upload') return '上传讲义'
  return matched?.label || '管理后台'
})

function logout() {
  localStorage.removeItem('adminToken')
  router.push('/admin')
}
</script>

<style scoped>
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  background: #f7f8fb;
  color: #172033;
}

.admin-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 24px 18px;
  background: #ffffff;
  border-right: 1px solid #e6eaf0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #172033;
  text-decoration: none;
}

.brand-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #2f6fed;
  color: white;
  font-weight: 800;
}

.brand strong,
.brand small {
  display: block;
  line-height: 1.2;
}

.brand small {
  margin-top: 3px;
  color: #6d7788;
  font-size: 12px;
}

.admin-nav {
  display: grid;
  gap: 6px;
}

.admin-nav-link,
.logout-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #4d596d;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.admin-nav-link:hover,
.logout-button:hover {
  background: #f1f5fb;
  color: #172033;
}

.admin-nav-link.router-link-active {
  background: #eaf1ff;
  color: #1f5fce;
}

.admin-nav-link.secondary {
  justify-content: center;
  border: 1px solid #e6eaf0;
}

.nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.45;
}

.sidebar-footer {
  margin-top: auto;
  display: grid;
  gap: 8px;
}

.logout-button {
  justify-content: center;
  color: #b42318;
}

.admin-main {
  min-width: 0;
}

.admin-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88px;
  padding: 18px 32px;
  background: rgba(255, 255, 255, 0.88);
  border-bottom: 1px solid #e6eaf0;
  backdrop-filter: blur(12px);
}

.eyebrow {
  margin-bottom: 3px;
  color: #6d7788;
  font-size: 13px;
  font-weight: 700;
}

.admin-topbar h1 {
  color: #172033;
  font-size: 24px;
  line-height: 1.2;
}

.admin-content {
  padding: 28px 32px 48px;
}

@media (max-width: 900px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    position: static;
    height: auto;
    gap: 16px;
    padding: 16px;
    border-right: 0;
    border-bottom: 1px solid #e6eaf0;
  }

  .admin-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sidebar-footer {
    grid-template-columns: 1fr 1fr;
  }

  .admin-topbar,
  .admin-content {
    padding-left: 18px;
    padding-right: 18px;
  }
}

@media (max-width: 520px) {
  .admin-nav,
  .sidebar-footer {
    grid-template-columns: 1fr;
  }
}
</style>
