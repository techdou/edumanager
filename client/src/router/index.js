import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../views/Profile.vue')
  },
  {
    path: '/lectures',
    component: () => import('../views/Home.vue'),
    meta: { requiresStudent: true }
  },
  {
    path: '/login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/register',
    component: () => import('../views/Register.vue')
  },
  {
    path: '/lecture/:slug/:chapter?',
    component: () => import('../views/Lecture.vue'),
    meta: { requiresStudent: true }
  },
  {
    path: '/admin',
    component: () => import('../views/admin/Login.vue')
  },
  {
    path: '/admin/register',
    component: () => import('../views/admin/Register.vue')
  },
  {
    path: '/admin/dashboard',
    component: () => import('../views/admin/Dashboard.vue'),
    meta: { requiresAdmin: true }
  },
  {
    path: '/admin/upload',
    component: () => import('../views/admin/Upload.vue'),
    meta: { requiresAdmin: true }
  },
  {
    path: '/admin/profile',
    component: () => import('../views/admin/ProfileUpload.vue'),
    meta: { requiresAdmin: true }
  }
]

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

router.beforeEach((to, from, next) => {
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
