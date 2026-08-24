/**
 * 讲义 iframe URL 构造的唯一出口。
 * 三处视图（Home/Learn/Lecture）原来各自复制同一份实现，改一处漏两处，
 * 后续把 access_token 换成一次性票据时也只需要改这里。
 */
export function buildLectureSrc(lecturePath) {
  // lecturePath 形如 'slug/chapter-dir/index.html'（不含 /lectures/ 前缀）
  const token = localStorage.getItem('token')
  const query = token ? `?access_token=${encodeURIComponent(token)}` : ''
  return `/lectures/${lecturePath}${query}`
}

export function buildChapterSrc(lecture, chapter) {
  const entry = chapter?.entry_file || 'index.html'
  const chapterPath = chapter?.path
    ? `${chapter.path}/${entry}`
    : `${lecture.slug}/${entry}`
  return buildLectureSrc(chapterPath)
}
