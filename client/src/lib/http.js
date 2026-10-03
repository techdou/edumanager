import axios from 'axios'
import { authHeaders, clearAuth, loginLocation } from './auth'

/**
 * 统一 HTTP 客户端：拦截请求/响应，集中处理鉴权、错误、超时。
 * - 请求：自动带 token（student 或 admin，按 baseUrl 判断）
 * - 响应：401 自动登出跳转、网络错误与超时友好提示
 *
 * 用法：业务代码用 api.get('/api/lectures')，错误已在此处统一处理，
 *       调用方只需关心"成功的数据"，失败时不会得到 undefined 而崩溃。
 */

const api = axios.create({
  baseURL: '/',
  timeout: 30000
})

// 简易全局错误提示（避免引入额外 UI 库；可被覆盖）
let toastEl = null
function showToast(message, type = 'error') {
  if (typeof document === 'undefined') return
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.id = '__http_toast'
    toastEl.style.cssText = [
      'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'padding:12px 20px', 'border-radius:8px',
      'font-size:14px', 'color:#fff', 'max-width:90vw', 'word-break:break-word',
      'box-shadow:0 4px 12px rgba(0,0,0,.15)', 'transition:opacity .3s',
      'font-family:system-ui,sans-serif'
    ].join(';')
    document.body.appendChild(toastEl)
  }
  toastEl.style.background = type === 'error' ? '#dc2626' : (type === 'warn' ? '#d97706' : '#2563eb')
  toastEl.textContent = message
  toastEl.style.opacity = '1'
  clearTimeout(toastEl._timer)
  toastEl._timer = setTimeout(() => { toastEl.style.opacity = '0' }, 4000)
}

// 请求拦截：自动带 token（已由调用方注入 Authorization 时不覆盖，如 adminApi 绝对路径请求）
api.interceptors.request.use((config) => {
  const isAdminApi = config.authRole === 'admin' || (config.url || '').includes('/api/admin') || window.location.pathname.startsWith('/admin')
  config.headers ||= {}
  if (!config.headers?.Authorization && !config.headers?.authorization) {
    Object.assign(config.headers, authHeaders(isAdminApi))
  }
  return config
}, (error) => Promise.reject(error))

// 响应拦截：统一错误处理
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const data = error.response?.data
    const message = (data && (data.error || data.message)) || ''

    // 取消的请求不处理
    if (axios.isCancel(error)) return Promise.reject(error)

    if (error.config?.silent && status !== 401) return Promise.reject(error)

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      showToast('请求超时，请检查网络后重试')
    } else if (!error.response) {
      // 网络错误 / 服务不可达
      showToast('网络连接失败，请检查网络或稍后重试')
    } else if (status === 401) {
      if (!error.config?.skipAuthRedirect && !/\/api\/auth\/(?:admin|student)\/(?:login|register)/.test(error.config?.url || '')) {
        const admin = error.config?.authRole === 'admin' || window.location.pathname.startsWith('/admin')
        clearAuth()
        window.location.assign(loginLocation(admin))
      }
    } else if (status === 403) {
      showToast(message || '没有权限执行此操作')
    } else if (status === 413) {
      showToast('文件过大')
    } else if (status >= 500) {
      showToast(message || '服务器繁忙，请稍后重试')
    } else if (status >= 400 && message) {
      showToast(message)
    }
    return Promise.reject(error)
  }
)

export { showToast }
export default api
