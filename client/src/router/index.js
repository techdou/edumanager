import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../views/Home.vue')
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
    component: () => import('../views/Lecture.vue')
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
  if (to.meta.requiresAdmin) {
    const token = localStorage.getItem('adminToken')
    if (!token || !isValidToken(token)) {
      localStorage.removeItem('adminToken')
      next('/admin')
      return
    }
  }
  next()
})

export default router