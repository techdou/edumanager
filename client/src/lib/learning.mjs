export function safeReturnPath(value, fallback = '/learn') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return fallback
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || /^\/(?:login|register)(?:[/?#]|$)/.test(value) || /^\/admin(?:\/register)?(?:[?#]|$)/.test(value)) return fallback
    return url.pathname + url.search + url.hash
  } catch { return fallback }
}

export function searchLectures(lectures, query = '', category = 'all') {
  const term = query.trim().toLocaleLowerCase()
  return lectures.filter(lecture => category === 'all' || String(lecture.category_id) === String(category)).flatMap(lecture => {
    const allChapters = lecture.chapters || []
    const matchesLecture = !term || [lecture.title, lecture.category_name].some(text => String(text || '').toLocaleLowerCase().includes(term))
    const chapters = matchesLecture ? allChapters : allChapters.filter(chapter => String(chapter.title || '').toLocaleLowerCase().includes(term))
    return matchesLecture || chapters.length ? [{ ...lecture, chapters }] : []
  })
}

export function chapterUrl(lectureSlug, chapterSlug) {
  return `/lecture/${encodeURIComponent(lectureSlug)}${chapterSlug && chapterSlug !== lectureSlug ? '/' + encodeURIComponent(chapterSlug) : ''}`
}

export function progressItem(row) {
  return { ...row, progress: Math.max(0, Math.min(100, Number(row.position ?? row.progress) || 0)), completed: row.completed === true || row.completed === 1, updatedAt: row.updatedAt || Date.parse(String(row.updated_at || '').replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(row.updated_at || '') ? '' : 'Z')) || Date.now() }
}
