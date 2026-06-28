import api from './http'

/**
 * 管理后台专用请求封装。
 * 复用统一 http 实例（含 401 跳登录、错误提示拦截器），
 * 仅在 url 前自动拼接 /api/admin 前缀。
 *
 * 请求拦截器会识别 url 中的 /api/admin 并自动带 adminToken。
 */
const ADMIN_PREFIX = '/api/admin'

export default {
  get: (url, config) => api.get(`${ADMIN_PREFIX}${url}`, config),
  post: (url, data, config) => api.post(`${ADMIN_PREFIX}${url}`, data, config),
  put: (url, data, config) => api.put(`${ADMIN_PREFIX}${url}`, data, config),
  delete: (url, config) => api.delete(`${ADMIN_PREFIX}${url}`, config),
  patch: (url, data, config) => api.patch(`${ADMIN_PREFIX}${url}`, data, config)
}
