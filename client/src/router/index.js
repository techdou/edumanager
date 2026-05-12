import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../views/Home.vue'),
    meta: { title: 'EduManager - 在线教育讲义管理平台 | 课程资料管理与学习系统' }
  },
  {
    path: '/login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录 - EduManager' }
  },
  {
    path: '/register',
    component: () => import('../views/Register.vue'),
    meta: { title: '注册 - EduManager' }
  },
  {
    path: '/lecture/:slug/:chapter?',
    component: () => import('../views/Lecture.vue'),
    meta: { requiresStudent: true, title: '讲义学习 - EduManager' }
  },
  {
    path: '/learn',
    component: () => import('../views/Learn.vue'),
    meta: { requiresStudent: true, title: '学习中心 - EduManager' }
  },
  {
    path: '/profile',
    component: () => import('../views/Profile.vue'),
    meta: { requiresStudent: true, title: '学生中心 - EduManager' }
  },
  {
    path: '/admin',
    component: () => import('../views/admin/Login.vue'),
    meta: { title: '管理员登录 - EduManager' }
  },
  {
    path: '/admin/register',
    component: () => import('../views/admin/Register.vue'),
    meta: { title: '管理员注册 - EduManager' }
  },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      {
        path: 'dashboard',
        component: () => import('../views/admin/Stats.vue'),
        meta: { title: '数据统计 - EduManager 后台' }
      },
      {
        path: 'users',
        component: () => import('../views/admin/Users.vue'),
        meta: { title: '用户管理 - EduManager 后台' }
      },
      {
        path: 'categories',
        component: () => import('../views/admin/Categories.vue'),
        meta: { title: '分类管理 - EduManager 后台' }
      },
      {
        path: 'lectures',
        component: () => import('../views/admin/Dashboard.vue'),
        meta: { title: '讲义管理 - EduManager 后台' }
      },
      {
        path: 'groups',
        component: () => import('../views/admin/Groups.vue'),
        meta: { title: '班级管理 - EduManager 后台' }
      },
      {
        path: 'knowledge',
        component: () => import('../views/admin/Knowledge.vue'),
        meta: { title: '知识库 - EduManager 后台' }
      },
      {
        path: 'upload',
        component: () => import('../views/admin/Upload.vue'),
        meta: { title: '上传讲义 - EduManager 后台' }
      }
    ]
  }
]

// 兜底路由：未知路径重定向到首页（如旧的 /lectures 书签）
routes.push({
  path: '/:pathMatch(.*)*',
  redirect: '/'
})

const router = createRouter({
  history: createWebHistory(),
  routes
})

function isValidToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

const DEFAULT_TITLE = 'EduManager - 在线教育讲义管理平台'

router.beforeEach((to, from, next) => {
  // 动态更新页面标题
  const title = to.meta?.title || (to.matched.find(r => r.meta?.title)?.meta?.title) || DEFAULT_TITLE
  document.title = title

  // Admin guard
  if (to.meta.requiresAdmin) {
    const token = localStorage.getItem('adminToken')
    if (!token || !isValidToken(token)) {
      localStorage.removeItem('adminToken')
      next('/admin')
      return
    }
  }
  // Student guard
  if (to.meta.requiresStudent) {
    const token = localStorage.getItem('token')
    if (!token || !isValidToken(token)) {
      localStorage.removeItem('token')
      next('/')
      return
    }
  }
  next()
})

export default router
