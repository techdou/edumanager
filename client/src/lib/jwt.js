/**
 * JWT 前端解码工具。
 *
 * 注意：JWT payload 用的是 base64url 编码（字符集含 `-` 和 `_`），
 * 而 atob 只接受标准 base64（`+` 和 `/`）——直接 atob 解码会在
 * payload 恰好含 `-`/`_` 时抛 InvalidCharacterError，把有效 token
 * 误判为过期（表现为"部分用户永远进不了学习页"）。
 * 这里先做字符集替换再解码。
 */

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  } catch {
    return null
  }
}

export function isTokenExpired(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return payload.exp * 1000 <= Date.now()
}

/** 路由守卫用：token 存在且未过期 */
export function isValidToken(token) {
  return !!token && !isTokenExpired(token)
}
