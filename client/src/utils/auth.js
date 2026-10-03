/**
 * 学生态登出的唯一出口。
 * 语义：只清学生态（token + 用户名缓存），不动 adminToken——
 * 管理员后台的登录态由后台自己的退出按钮负责，两端互不干扰。
 */
export function logoutStudent() {
  localStorage.removeItem('token')
  localStorage.removeItem('studentUsername')
}
