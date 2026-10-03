import api from './http'
import { authHeaders, clearAuth, getToken } from './auth'
let sessionToken = ''
let expiresAt = 0
let pending = null
export async function ensureContentSession(admin = false) {
  const token = getToken(admin)
  if (!token) return
  if (token === sessionToken && Date.now() < expiresAt) return
  if (pending?.token === token) return pending.promise
  const promise = api.post('/api/auth/content-session', {}, { headers: authHeaders(admin), authRole: admin ? 'admin' : 'student' }).then(() => {
    sessionToken = token
    expiresAt = Date.now() + 60 * 1000
  }).finally(() => { if (pending?.promise === promise) pending = null })
  pending = { token, promise }
  return promise
}
export async function logoutSession() {
  try { await api.post('/api/auth/logout', {}, { skipAuthRedirect: true }) }
  finally { sessionToken = ''; expiresAt = 0; clearAuth() }
}
export async function openDocument(doc, admin = false) {
  const target = doc.file_url || doc.url
  // Open synchronously so browsers do not treat the completed session request as a popup.
  const tab = window.open('about:blank', '_blank')
  if (tab) tab.opener = null
  try {
    if (doc.file_type) await ensureContentSession(admin)
    const url = new URL(target, window.location.origin)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('不支持的文档地址')
    if (tab) tab.location.href = url.href
    else window.location.assign(url.href)
  } catch (error) { tab?.close(); throw error }
}
