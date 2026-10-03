import api from './http'
import { getToken, userKey } from './auth'
import { progressItem } from './learning.mjs'
const cacheKey = () => `edumanager:recentLectures:${userKey()}`
export function cachedProgress() {
  try { const rows = JSON.parse(localStorage.getItem(cacheKey()) || '[]'); return Array.isArray(rows) ? rows.map(progressItem) : [] } catch { return [] }
}
function cacheRows(rows, key = cacheKey()) { try { localStorage.setItem(key, JSON.stringify(rows)) } catch { /* Storage may be unavailable. */ } }
export async function loadProgress() {
  const token = getToken()
  const key = cacheKey()
  if (!token) return []
  const { data } = await api.get('/api/progress', { silent: true, headers: { Authorization: `Bearer ${token}` } })
  if (getToken() !== token) return []
  const rows = (Array.isArray(data) ? data : []).map(progressItem)
  cacheRows(rows, key)
  return rows
}
export function cacheProgress(item) {
  const normalized = progressItem(item)
  cacheRows([normalized, ...cachedProgress().filter(row => `${row.lectureSlug}/${row.chapterSlug}` !== `${normalized.lectureSlug}/${normalized.chapterSlug}`)].slice(0, 100))
}
export async function saveProgress(item, completed, token = getToken()) {
  if (!token || token !== getToken()) return
  cacheProgress(item)
  if (!getToken() || !item.lecture_id || !item.chapter_id) return
  const body = { position: item.progress }
  if (typeof completed === 'boolean') body.completed = completed
  await api.put(`/api/progress/${item.lecture_id}/${item.chapter_id}`, body, { silent: true, headers: { Authorization: `Bearer ${token}` } })
}
