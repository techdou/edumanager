export function formatDateTime(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}
