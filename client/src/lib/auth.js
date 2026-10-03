import { safeReturnPath } from './learning.mjs'

export function getToken(admin = false) {
  return localStorage.getItem(admin ? 'adminToken' : 'token') || ''
}
export function authHeaders(admin = false) {
  const token = getToken(admin)
  return token ? { Authorization: `Bearer ${token}` } : {}
}
export function notifyAuthChanged() { window.dispatchEvent(new Event('auth-changed')) }
export function setAuth(data) {
  localStorage.setItem('token', data.token)
  localStorage.setItem('studentUsername', data.username || '')
  if (data.role === 'admin') localStorage.setItem('adminToken', data.token)
  else localStorage.removeItem('adminToken')
  notifyAuthChanged()
}
export function clearAuth() {
  for (const key of ['token', 'adminToken', 'studentUsername']) localStorage.removeItem(key)
  notifyAuthChanged()
}
export function loginLocation(admin = false, target = window.location.pathname + window.location.search + window.location.hash) {
  return `${admin ? '/admin' : '/login'}?redirect=${encodeURIComponent(safeReturnPath(target, admin ? '/admin/dashboard' : '/learn'))}`
}
export function userKey() {
  try { return JSON.parse(atob(getToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || 'guest' } catch { return 'guest' }
}
export function validToken(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000 > Date.now() } catch { return false }
}
