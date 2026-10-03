/**
 * 讲义 iframe URL 构造的唯一出口。
 * 三处视图（Home/Learn/Lecture）原来各自复制同一份实现，改一处漏两处，
 * 受保护的资源通过短期 HttpOnly 内容会话授权，URL 不含登录凭据。
 */
export function buildLectureSrc(lecturePath) {
  // lecturePath 形如 'slug/chapter-dir/index.html'（不含 /lectures/ 前缀）
  const safePath = String(lecturePath).split('/').map(encodeURIComponent).join('/')
  return `/lectures/${safePath}`
}

export function buildChapterSrc(lecture, chapter) {
  const entry = chapter?.entry_file || 'index.html'
  const chapterPath = chapter?.path
    ? `${chapter.path}/${entry}`
    : `${lecture.slug}/${entry}`
  return buildLectureSrc(chapterPath)
}
