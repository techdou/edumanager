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

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAdmin && !localStorage.getItem('adminToken')) {
    next('/admin')
  } else {
    next()
  }
})

export default router