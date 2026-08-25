<div align="center">

# EduManager

**在线教育讲义管理平台**

上传、分类、分发课程资料，学生随时随地在线学习。

![Node](https://img.shields.io/badge/Node.js-%E2%89%A520.6-339933?logo=node.js&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)
![CI](https://github.com/techdou/edumanager/actions/workflows/ci.yml/badge.svg)

</div>

---

## 项目简介

EduManager 是一个面向教育机构的一站式讲义管理系统。管理员上传 ZIP/HTML 讲义包，系统自动解析章节目录并做内容安全消毒；学生通过「班级 × 分类」权限模型访问讲义，在线浏览、记录进度、撰写笔记，并支持全文检索与离线阅读。

## 功能特性

- 📚 **讲义管理** — 上传 ZIP/HTML 自动解析章节、提取目录，支持封面、分类与公开展示开关；上传时自动清除脚本与不安全属性，并生成安全扫描报告
- 🔎 **全文搜索** — 基于 SQLite FTS5 的讲义内容全文检索，结果按章节定位、关键词高亮，权限过滤与列表一致
- 📖 **在线学习** — 章节导航、目录定位、阅读进度跟踪（本地 + 服务端同步）、最近学习记录、导出 PDF
- 📝 **章节笔记** — 学习过程中随手记录，按讲义/章节归档，仅本人可见可管理
- 👥 **权限分级** — 公开精选 + 班级 × 分类混合权限模型，讲义与知识文档统一鉴权
- 🗂️ **知识库** — 整合外部文档链接与上传的 Markdown/PDF，在线预览、导出
- 📊 **学习看板** — 班级 × 讲义完成率矩阵、断点续学名单、卡点章节分析
- 🛠️ **管理后台** — 讲义 / 分类 / 用户 / 班级 / 数据统计一体化管理
- 📱 **PWA** — 打开过的讲义离线可读
- 🔒 **安全内建** — JWT 强密钥校验、路径穿越防护、iframe 沙箱、改密即失效旧 token、内容消毒管道

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 · Vite · Vue Router · Axios · Markdown-it · Mermaid · KaTeX |
| 后端 | Node.js ≥ 20.6 · Express · better-sqlite3（WAL + 事务 + FTS5） |
| 认证 | JWT（管理员/学生双角色，改密失效） |
| 文件 | Multer 上传 · AdmZip/unar 解压（自动降级）· 原子目录写入 |
| 质量 | Vitest 单测 · 端到端冒烟测试（18 项）· GitHub Actions CI |

## 快速开始

### 环境要求

- **Node.js ≥ 20.6**（`npm run` 脚本依赖 `--env-file`）
- 可选：`unar` 或 `unzip`（都没有时自动降级为纯 JS 解压）

### 安装与本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/techdou/edumanager.git
cd edumanager

# 2. 安装依赖
npm install
cd client && npm install && cd ..

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET（缺失或过短会拒绝启动）：
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. 启动开发服务（后端 :3142 + 前端 :3001）
npm run dev
```

前端开发地址：<http://localhost:3001>（Vite 代理转发 API 到后端）。

### 生产部署

```bash
# 构建前端
cd client && npm run build && cd ..

# 生产模式启动（读取 .env 中的 NODE_ENV=production，
# 启动时自动备份数据库、托管前端构建产物）
npm run server:prod
```

访问 <http://localhost:3142>。

部署要点：

1. `.env` 设置 `NODE_ENV=production` 与强随机 `JWT_SECRET`
2. 用 PM2 / systemd 管理进程：`pm2 start server/index.js --name edumanager`
3. Nginx 反向代理到 `:3142` 并配置 HTTPS
4. 定期备份 `data/` 目录（建议 crontab + `npm run backup`）

## 配置说明

所有配置通过环境变量读取（`.env`），完整模板见 [`.env.example`](.env.example)。

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | **是** | JWT 签名密钥，缺失或长度不足 32 会**拒绝启动** |
| `NODE_ENV` | 否 | `production` 启用启动备份等生产行为 |
| `PORT` | 否 | 后端端口，默认 `3142` |
| `CORS_ORIGIN` | 否 | CORS 白名单（逗号分隔），不设则允许所有来源，生产建议显式设置 |
| `DATA_DIR` | 否 | 数据目录，默认项目根 `data/` |
| `LECTURES_DIR` | 否 | 讲义文件目录，默认项目根 `lectures/` |
| `LOG_LEVEL` | 否 | 日志级别 `error/warn/info/debug`，默认 `info` |

## 项目结构

```
edumanager/
├── server/                  # 后端（Express + better-sqlite3）
│   ├── index.js             # 入口：路由挂载、HTML 进度脚本注入、错误兜底、优雅关闭
│   ├── db.js                # 数据层（WAL、事务、自动迁移）
│   ├── config.js            # 集中配置 + JWT_SECRET 强校验
│   ├── logger.js            # 结构化 JSON 日志
│   ├── routes/              # auth / lecture / category / admin / knowledge / search / progress / notes
│   ├── middleware/          # adminAuth / studentAuth
│   └── utils/               # permissions / 原子写入 / TOC 提取 / FTS5 搜索 / 内容消毒
├── client/                  # 前端（Vue 3 + Vite）
│   ├── src/views/           # 学生端 + 管理后台页面
│   ├── src/components/      # 通用组件
│   ├── src/lib/             # http / adminApi / jwt 封装
│   ├── src/utils/           # 日期 / 导出 / 讲义 URL 等工具
│   └── public/              # 静态资源 + PWA（manifest / Service Worker）
├── scripts/                 # 运维与测试脚本（冒烟 / 事务 / 备份 / 迁移核对）
├── .github/workflows/       # CI（语法检查 + 前端测试 + 构建）
├── .env.example             # 环境变量模板
└── package.json
```

> `data/`、`lectures/`、`uploads/` 为运行时目录，由程序生成，不入库。

## 测试与脚本

```bash
npm run backup                              # 手动备份数据库（async，失败非零退出）
npm run verify                              # 数据库完整性核对
node --env-file=.env scripts/smoke_test.js  # 端到端冒烟测试（18 项，自起独立端口服务）
node --env-file=.env scripts/tx_test.js     # 事务回滚验证

cd client
npx vitest run                              # 前端单元测试
npx vite build                              # 生产构建
```

## 安全说明

- JWT 密钥缺失拒绝启动，无任何兜底值；修改密码后旧 token 立即失效
- 上传文件名白名单校验 + ZIP 解压路径穿越（ZIP slip）防护
- 讲义 HTML 默认消毒（剥离脚本 / 内联事件 / 危险协议链接），iframe 沙箱仅 `allow-scripts`
- 讲义内容安全扫描报告随上传结果展示，供管理员决策

## 许可

[Apache-2.0](LICENSE) © TechDou
