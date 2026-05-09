# EduManager 功能优化与架构改进方案

## 现状分析

### 当前架构
- **前端**: Vue 3 + Vite (client/)，Next.js (src/)
- **后端**: Express + sql.js (SQLite)
- **部署**: 腾讯云 (edu.techdou.com)

### 已完成功能
- ✅ 讲义上传/管理/展示
- ✅ 分类系统
- ✅ 学生登录/注册
- ✅ 管理后台 (Dashboard, Upload, Categories, Users, Stats)
- ✅ 章节目录导航
- ✅ 响应式设计

---

## 建议添加的功能

### 1. 学习进度追踪 (高优先级)
```
功能:
- 学生阅读进度记录
- 章节完成状态
- 学习时长统计
- 最后阅读位置记忆

数据库表:
- user_progress: user_id, lecture_id, chapter_id, completed, read_time, last_position
- user_stats: user_id, total_read_time, lectures_completed, chapters_completed
```

### 2. 搜索功能 (高优先级)
```
功能:
- 全文搜索讲义内容
- 按标题/分类/内容搜索
- 搜索结果高亮
- 搜索历史

实现:
- 后端: 用 sql.js 的 FTS (Full Text Search)
- 前端: 搜索框 + 结果页
```

### 3. 笔记/标注系统 (中优先级)
```
功能:
- 学生在讲义上添加笔记
- 高亮/划线
- 笔记列表页
- 导出笔记

数据库表:
- notes: id, user_id, lecture_id, chapter_id, content, position, created_at
```

### 4. 测验/练习系统 (中优先级)
```
功能:
- 每章末尾添加测验
- 选择题/填空题
- 自动评分
- 错题本
- 成绩统计

数据库表:
- quizzes: id, chapter_id, questions (JSON)
- quiz_attempts: id, user_id, quiz_id, answers, score, completed_at
```

### 5. 评论/讨论区 (中优先级)
```
功能:
- 每章讨论区
- 学生提问/回答
- 管理员回复
- 点赞/踩

数据库表:
- comments: id, chapter_id, user_id, content, parent_id, created_at
```

### 6. 通知系统 (中优先级)
```
功能:
- 新讲义上架通知
- 测验截止提醒
- 回复通知
- 系统公告

实现:
- 前端: 通知中心组件
- 后端: 通知表 + WebSocket 推送
```

### 7. 数据分析 (低优先级)
```
功能:
- 学生学习报告
- 热门讲义排行
- 活跃时段分析
- 完成率统计

实现:
- 后端: 聚合查询
- 前端: 图表 (ECharts/Chart.js)
```

### 8. 移动端优化 (中优先级)
```
功能:
- PWA 支持
- 离线阅读
- 推送通知
- 手势操作
```

---

## 架构优化建议

### 1. 数据库迁移 (重要)
```
现状: sql.js (SQLite) - 内存数据库，重启数据丢失
建议: 迁移到 PostgreSQL/MySQL

原因:
- 数据持久化
- 并发支持
- 更好的性能
- 支持 FTS、JSON 字段

迁移方案:
- 用 Prisma ORM (已有 prisma/ 目录)
- 渐进式迁移，先双写再切换
```

### 2. API 设计规范化
```
现状: REST API 但不够规范
建议:
- 统一响应格式: { code, data, message }
- 统一错误处理
- 添加 API 版本控制 (/api/v1/...)
- 添加 Swagger/OpenAPI 文档
```

### 3. 认证授权增强
```
现状: JWT + localStorage
建议:
- 添加 Refresh Token 机制
- 角色权限系统 (RBAC)
- API 速率限制
- 密码强度策略
```

### 4. 前端架构优化
```
现状: Vue 3 单文件组件
建议:
- 添加 Pinia 状态管理 (替代 localStorage 存储用户态)
- 组件库规范化 (封装通用组件)
- 路由守卫完善
- 错误边界处理
- 性能优化 (懒加载、虚拟滚动)
```

### 5. 文件存储优化
```
现状: 本地文件系统 (lectures/)
建议:
- 迁移到对象存储 (腾讯云 COS/阿里云 OSS)
- CDN 加速
- 文件压缩/转码
- 防盗链
```

### 6. 监控与日志
```
建议:
- 添加错误监控 (Sentry)
- 性能监控
- 访问日志
- 自动化测试
```

### 7. 部署优化
```
现状: 手动部署到腾讯云
建议:
- CI/CD 流水线 (GitHub Actions)
- Docker 容器化
- 蓝绿部署
- 自动备份
```

---

## 实施优先级

| 优先级 | 功能 | 原因 |
|--------|------|------|
| P0 | 数据库持久化 | 数据安全是底线 |
| P0 | 搜索功能 | 讲义多了必须有 |
| P1 | 学习进度 | 核心学习体验 |
| P1 | 笔记系统 | 学习闭环 |
| P2 | 测验系统 | 检验学习效果 |
| P2 | 评论讨论 | 互动性 |
| P3 | 数据分析 | 运营需要 |
| P3 | 移动端/PWA | 使用场景扩展 |

---

## 技术选型建议

| 组件 | 当前 | 建议 |
|------|------|------|
| 数据库 | sql.js | PostgreSQL (用 Prisma) |
| 缓存 | 无 | Redis (会话、热点数据) |
| 搜索 | 无 | PostgreSQL FTS / MeiliSearch |
| 文件存储 | 本地 | 腾讯云 COS |
| 状态管理 | localStorage | Pinia |
| 组件库 | 手写 | Element Plus / Ant Design Vue |
| 图表 | 无 | ECharts |
| 测试 | 无 | Vitest + Playwright |

---

## 下一步行动

1. **立即**: 提交当前未提交的代码到 Git
2. **本周**: 数据库迁移到 PostgreSQL
3. **下周**: 实现搜索功能
4. **后续**: 按优先级逐个实现功能

要我帮你开始实施哪个？