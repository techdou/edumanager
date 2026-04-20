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
    path: '/admin/dashboard',
    component: () => import('../views/admin/Dashboard.vue')
  },
  {
    path: '/admin/upload',
    component: () => import('../views/admin/Upload.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router