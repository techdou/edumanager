import api from './http'

/**
 * 管理后台专用请求封装。
 * 复用统一 http 实例（含 401 跳登录、错误提示拦截器）。
 *
 * - 相对路径（如 '/users'）：自动拼 /api/admin 前缀
 * - 绝对路径（以 /api 开头，如 '/api/lectures'）：原样发送——
 *   讲义/知识库的管理端点不在 /api/admin 下，靠 adminAuth 中间件保护
 *
 * 所有请求自动带 adminToken（http 拦截器不会覆盖这里注入的 Authorization）。
 */
const ADMIN_PREFIX = '/api/admin'

function withAdminToken(config = {}) {
  const token = localStorage.getItem('adminToken')
  if (!token) return config
  return {
    ...config,
    headers: { ...(config.headers || {}), Authorization: `Bearer ${token}` }
  }
}

function resolveUrl(url) {
  return url.startsWith('/api') || /^https?:\/\//.test(url) ? url : `${ADMIN_PREFIX}${url}`
}

export default {
  get: (url, config) => api.get(resolveUrl(url), withAdminToken(config)),
  post: (url, data, config) => api.post(resolveUrl(url), data, withAdminToken(config)),
  put: (url, data, config) => api.put(resolveUrl(url), data, withAdminToken(config)),
  delete: (url, config) => api.delete(resolveUrl(url), withAdminToken(config)),
  patch: (url, data, config) => api.patch(resolveUrl(url), data, withAdminToken(config))
}
