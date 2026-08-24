<div align="center">

# EduManager

**在线教育讲义管理平台**

上传、分类、分发课程资料，学生随时随地在线学习。

</div>

---

## 项目简介

EduManager 是一个面向教育机构的一站式讲义管理系统。管理员可上传 ZIP/HTML 讲义包，系统自动解析章节目录；学生通过班级×分类权限访问讲义，在线浏览并跟踪学习进度。

### 核心功能

- 📚 **讲义管理** — 上传 ZIP/HTML 讲义，自动解析章节、提取目录、支持封面与分类；上传时自动消毒脚本与不安全属性并生成安全扫描报告
- 👥 **权限分级** — 公开精选 + 班级×分类权限混合模型（讲义与知识文档统一模型），精细控制访问范围
- 📖 **在线学习** — 章节导航、目录定位、阅读进度跟踪（本地 + 服务端同步）、章节笔记
- 🔎 **全文搜索** — SQLite FTS5 全文检索讲义内容，结果带章节定位与关键词高亮
- 🗂️ **知识库** — 整合飞书文档链接，支持 Markdown/PDF 在线预览、导出 PDF/PNG/MD
- 📊 **学习看板** — 班级×讲义完成率矩阵、断点续学名单、卡点章节分析
- 🛠️ **管理后台** — 讲义/分类/用户/班级/数据统计一体化管理
- 📱 **PWA** — 打开过的讲义离线可读
- 🎨 **现代界面** — 响应式设计、骨架屏、暗色模式友好的 OKLCH 色彩系统

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 · Vite · Vue Router · Axios · Markdown-it · Mermaid |
| 后端 | Node.js · Express · better-sqlite3 (SQLite + WAL) |
| 认证 | JWT（管理员/学生双角色） |
| 文件 | Multer 上传 · AdmZip/unar 解压 · 原子目录写入 |

## 快速开始

### 环境要求

- **Node.js ≥ 18**（推荐 20+）
- **unar 或 unzip**（上传 ZIP 讲义所需，二选一）

### 安装与本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/techdou/edumanager.git
cd edumanager

# 2. 安装后端依赖
npm install

# 3. 安装前端依赖
cd client && npm install && cd ..

# 4. 配置环境变量（必填）
cp .env.example .env
# 编辑 .env，至少设置 JWT_SECRET（生成方式见下文）

# 5. 启动开发服务（后端 :3142 + 前端 :3001）
npm run dev
```

前端开发地址：http://localhost:3001 （通过 Vite 代理转发 API 到后端）

### 生产构建

```bash
# 构建前端静态资源到 client/dist/
cd client && npm run build && cd ..

# 以生产模式启动（自动加载 .env，托管前端静态资源）
NODE_ENV=production node server/index.js
```

访问 http://localhost:3142 ，后端会同时托管前端构建产物。

## 配置说明

所有配置通过环境变量读取（`.env` 文件），见 [`.env.example`](.env.example)。

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | **是** | JWT 签名密钥。生产环境缺失会**拒绝启动**。生成：`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | 否 | `production` 时启用启动备份、严格密钥校验 |
| `PORT` | 否 | 后端端口，默认 `3142` |
| `CORS_ORIGIN` | 否 | CORS 白名单，逗号分隔。不设则允许所有来源 |
| `DATA_DIR` | 否 | 数据存储目录，默认项目根 `data/` |
| `LECTURES_DIR` | 否 | 讲义文件目录，默认项目根 `lectures/` |
| `LOG_LEVEL` | 否 | 日志级别 `error/warn/info/debug`，默认 `info` |

## 目录结构

```
edumanager/
├── server/                 # 后端（Express）
│   ├── index.js            # 入口：路由挂载、错误兜底、优雅关闭
│   ├── db.js               # better-sqlite3 数据层（WAL + 事务）
│   ├── config.js           # 集中配置 + JWT_SECRET 强校验
│   ├── logger.js           # 结构化 JSON 日志
│   ├── routes/             # auth / lecture / admin / category / knowledge / search / progress / notes
│   ├── middleware/         # adminAuth / studentAuth
│   └── utils/              # permissions / fs(原子写入) / tocExtractor / searchIndex(FTS5) / sanitizer(内容消毒) / lectureInjector(进度脚本注入)
├── client/                 # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── views/          # Home / Lecture / Learn / Profile / admin/*
│   │   ├── components/     # EditLectureModal / LoginModal / MarkdownPreview
│   │   ├── lib/            # http(Axios 封装) / adminApi / jwt
│   │   ├── utils/          # date / auth / lectureUrl / exporter(导出)
│   │   └── router/
│   └── public/             # favicon / logo 静态资源
├── scripts/                # 运维脚本
│   ├── smoke_test.js       # 端到端 API 冒烟测试
│   ├── verify_migration.js # 数据库完整性核对
│   ├── tx_test.js          # 事务回滚验证
│   └── backup.js           # 手动数据库备份
├── data/                   # 运行时数据（gitignore，自动生成）
├── lectures/               # 讲义文件（gitignore，自动生成）
├── .github/workflows/      # CI（语法检查 + 前端测试 + 构建）
├── .env.example            # 环境变量模板
├── DESIGN.md               # 权限系统设计文档
└── ROADMAP.md              # 功能路线图
```

## 数据库

使用 SQLite（better-sqlite3 驱动），数据库文件位于 `data/edumanager.db`。

- **WAL 模式**：写不阻塞读，崩溃自动恢复
- **外键约束**：已启用
- **事务**：所有多步写操作（讲义上传、用户管理等）均在事务内完成，保证原子性

### 备份

```bash
# 手动备份
npm run backup

# 生产环境每次启动会自动生成一份带时间戳的备份
```

### 运维脚本

```bash
npm run verify   # 核对数据库表结构与行数
npm run backup   # 手动备份数据库
node --env-file=.env scripts/smoke_test.js  # 端到端冒烟测试
```

## 部署

生产部署要点：

1. 在 `.env` 中设置 `NODE_ENV=production` 和强随机 `JWT_SECRET`（缺失或过短会拒绝启动）
2. 用 PM2 / systemd 管理进程：`pm2 start server/index.js --name edumanager`
3. 用 Nginx 反向代理到 `:3142`，配置 HTTPS
4. 定期备份 `data/` 目录（建议 crontab + `npm run backup`）

## 项目文档

- [DESIGN.md](DESIGN.md) — 权限系统（公开 + 班级×分类）设计文档
- [ROADMAP.md](ROADMAP.md) — 功能路线图与架构演进规划

## License

Apache-2.0
