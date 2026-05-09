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
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      {
        path: 'dashboard',
        component: () => import('../views/admin/Stats.vue')
      },
      {
        path: 'users',
        component: () => import('../views/admin/Users.vue')
      },
      {
        path: 'categories',
        component: () => import('../views/admin/Categories.vue')
      },
      {
        path: 'lectures',
        component: () => import('../views/admin/Dashboard.vue')
      },
      {
        path: 'upload',
        component: () => import('../views/admin/Upload.vue')
      }
    ]
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
