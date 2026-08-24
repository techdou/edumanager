import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { showToast } from './lib/http'

const app = createApp(App)

// 全局错误边界：任何组件渲染/生命周期抛错都兜住，避免整个应用白屏
app.config.errorHandler = (err, instance, info) => {
  // eslint-disable-next-line no-console
  console.error('[Vue error]', info, err)
  // 给用户可见反馈（节流：同一消息 3 秒内不重复弹）
  const msg = (err && err.message) || '页面发生异常'
  showToast(msg)
}

// 捕获未处理的 Promise 拒绝（如忘记 await 的异步报错）
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled rejection]', event.reason)
  })
}

app.use(router).mount('#app')

// PWA：仅生产构建注册 Service Worker（讲义离线阅读）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败不影响正常使用
    })
  })
}
