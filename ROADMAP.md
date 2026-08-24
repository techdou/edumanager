# EduManager 功能规划与架构路线

> 2026-08-25 重写：旧版 ROADMAP 中的"sql.js 内存库迁移 PostgreSQL / Next.js / Prisma"等描述
> 已过时（现为 better-sqlite3 + WAL 持久化，无 Next.js）。本文档反映当前实际状态。

## 已完成（2026-08 全量 review 后落地）

### 安全加固
- [x] 知识库读接口鉴权（is_public / 班级分类权限 / 管理员），管理端可设公开开关
- [x] 上传文件名路径穿越防护（basename + 白名单）；ZIP 解压 adm-zip 降级路径带 ZIP slip 防护
- [x] JWT_SECRET 缺失拒绝启动（无兜底密钥）；multer 升级 2.x（修复 DoS CVE）
- [x] 上传内容安全管道：默认剥离讲义 HTML 中的脚本/内联事件/危险协议链接，生成扫描报告
- [x] iframe 沙箱收紧：进度/TOC 跟踪脚本改由服务端注入，三处 iframe 全部仅 allow-scripts
- [x] 改密码后旧 token 立即失效（pwd_updated_at）；登录页显式身份选择

### 正确性与性能
- [x] 数据库备份 async 化（修复失败误报成功）；LECTURES_DIR 与静态服务统一
- [x] 讲义/用户列表 N+1 查询批量化；TOC 提取 mtime 缓存；bcrypt 异步化
- [x] 前端 JWT base64url 正确解码（修复概率性"随机踢人"）；Lecture 页竞态守卫 + 详情接口
- [x] 首页/学习中心/个人中心加载失败错误态 + 重试；KaTeX 移出首屏；系统字体栈替代 Google Fonts

### 新功能
- [x] **F1 全文搜索**：SQLite FTS5（unicode61，中文短语匹配），`GET /api/search`，首页搜索框带章节定位和高亮片段，权限过滤与讲义列表一致
- [x] **F2 内容安全管道**：`server/utils/sanitizer.js` 扫描+消毒，上传表单消毒开关，扫描报告入库（lectures.scan_report）并在上传结果展示
- [x] **F3 学习数据看板**：`user_progress` 表 + Lecture 页节流上报；管理端 Stats 页新增班级×讲义完成率矩阵、断点续学名单（7 天未回访）、卡点章节 Top10
- [x] **F4 章节笔记**：`notes` 表 + CRUD API（`/api/notes`，仅本人可改删）；Lecture 页笔记抽屉
- [x] **F5 CI**：GitHub Actions（服务端语法检查 + 前端 vitest + vite build）
- [x] **F6 PWA 离线阅读**：manifest + Service Worker（讲义 cache-first、外壳 network-first、API 不缓存），打开过的讲义离线可读

## 后续候选（未排期）

| 方向 | 说明 | 前置 |
|---|---|---|
| 讲义访问票据 | 用一次性短时 ticket 替换 iframe URL 里的 access_token（目前已收敛到 utils/lectureUrl.js 单一出口） | 无 |
| 测验/错题本 | 章节末测验、自动评分、错题本 | user_progress 已就绪 |
| 评论/讨论区 | 每章讨论、管理员回复 | 无 |
| 通知系统 | 新讲义上架通知（站内信即可起步，WebSocket 可后置） | 无 |
| 对象存储迁移 | 讲义文件迁腾讯云 COS + CDN | 讲义量大到本地盘吃紧时再做 |
| 运维监控 | Sentry 前端错误上报 + 服务器 uptime 监控 | 无 |

## 明确不做（当前规模下的过度设计）

- **迁 PostgreSQL/MySQL**：单机教育平台，better-sqlite3 + WAL 足够；FTS5 已覆盖搜索需求
- **引入 Redis**：无高并发会话/缓存压力
- **微服务化/容器编排**：单体 Express 部署简单可靠
