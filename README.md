<div align="center">

# EduManager

**在线教育讲义管理平台**

上传、分类、分发课程资料，学生随时随地在线学习。

![Node](https://img.shields.io/badge/Node.js-%E2%89%A522.12-339933?logo=node.js&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)
![CI](https://github.com/techdou/edumanager/actions/workflows/ci.yml/badge.svg)

</div>

---

## 项目简介

EduManager 是一个面向教育机构的一站式讲义管理系统。管理员上传 ZIP/HTML 讲义包，系统自动解析章节目录并做内容安全消毒；学生通过「班级 × 分类」权限模型访问讲义，在线浏览、记录进度、撰写笔记，并支持全文检索与离线阅读。

## 功能特性

- 📚 **讲义管理** — 上传 ZIP/HTML 自动解析章节、提取目录，支持封面、分类、公开展示、上一版本回退与上传失败保护；上传时自动清除脚本与不安全属性，并生成安全扫描报告
- 🔎 **全文搜索** — 基于 SQLite FTS5 的讲义内容全文检索，结果按章节定位、关键词高亮，权限过滤与列表一致
- 📖 **在线学习** — 章节导航、目录定位、按账号同步阅读位置与手动完成状态、最近学习记录及失败重试、导出 PDF
- 📝 **章节笔记** — 学习过程中随手记录，按讲义/章节归档，仅本人可见可管理
- 👥 **权限分级** — 公开精选 + 班级 × 分类混合权限模型，讲义与知识文档统一鉴权
- 🗂️ **知识库** — 整合外部文档链接与上传的 Markdown/PDF，在线预览、导出
- 📊 **学习看板** — 班级 × 讲义完成率矩阵、断点续学名单、卡点章节分析
- 🛠️ **管理后台** — 讲义 / 分类 / 用户 / 班级 / 数据统计一体化管理
- 📱 **PWA** — 公开讲义与应用外壳可离线回退，私有讲义不缓存
- 🔒 **安全内建** — JWT 强密钥校验、路径穿越防护、iframe 沙箱、改密即失效旧 token、内容消毒管道

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 · Vite · Vue Router · Axios · Markdown-it · Mermaid · KaTeX |
| 后端 | Node.js ≥ 22.12 · Express · better-sqlite3（WAL + 事务 + FTS5） |
| 认证 | JWT（管理员/学生双角色，改密失效） |
| 文件 | Multer 上传 · 受限 ZIP 工作线程 · 替换失败补偿与版本回退 |
| 质量 | Node/Vitest 回归测试 · 临时目录 API 冒烟测试 · GitHub Actions CI |

## 快速开始

### 环境要求

- **Node.js ≥ 22.12**（`npm run` 脚本依赖 `--env-file`）
- ZIP 在受限工作线程中验证和解压，无需 `unar` 或 `unzip`。生产私有内容访问需要 HTTPS。

### 安装与本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/techdou/edumanager.git
cd edumanager

# 2. 安装依赖
npm ci
npm --prefix client ci

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
npm run build

# 生产模式启动（显式启用 production，可选读取 .env）
# 版本迁移、搜索索引初始化和完整备份完成后监听端口
npm run server:prod
```

访问 <http://localhost:3142>。

部署要点：

1. `.env` 设置 `NODE_ENV=production` 与强随机 `JWT_SECRET`
2. 用 PM2 / systemd 管理单实例进程，保持与 `npm run server:prod` 相同的环境加载方式；直接 `node server/index.js` 不会自动读取 `.env`。
3. Nginx 反向代理到 `:3142` 并配置 HTTPS
4. 完整备份需要停止服务，备份数据库、讲义、知识库、封面和版本元数据；部署受控停服备份流程及异地副本。

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
├── .github/workflows/       # CI（后端回归 + 语法检查 + 前端测试 + 构建）
├── .env.example             # 环境变量模板
└── package.json
```

> `data/`、`lectures/`、`uploads/` 为运行时目录，由程序生成，不入库。

## 测试与脚本

```bash
npm test                        # 后端与学习逻辑回归，使用临时数据库及目录
npm run test:smoke              # 真实 HTTP/API 冒烟，隔离端口和目录
npm run test:tx                 # 临时数据库事务回滚
npm run check                  # 语法检查
npm --prefix client test       # 前端 Vitest 单元测试
npm run build                  # 前端生产构建
npm run verify                 # 实际配置数据库的只读完整性及历史孤立关联审计

# 先停止服务，再备份（服务运行时数据锁拒绝备份）
npm run backup
npm run verify:backup -- /path/to/backup
# 恢复目标必须不存在或为空，不覆盖当前实例
npm run restore -- /path/to/backup /path/to/new-empty-instance
```

恢复目录包含 `data/` 与 `lectures/`，核验后通过 `DATA_DIR`、`LECTURES_DIR` 指向恢复位置。备份默认保留 7 份，可设置 `BACKUP_DIR`、`BACKUP_RETENTION`；上传临时目录可设置 `UPLOADS_DIR`。升级前保留旧实例完整副本，启动备份在迁移后生成，不能替代升级前恢复点。

数据库版本化迁移保留已有数据，旧学习记录在章节匹配时迁入新的账号进度表，无法匹配的旧记录保留。知识库默认私有；管理员需显式开启公开展示。替换/回退讲义重建章节并重置相关学习进度。

GitHub Actions 在 `main` 推送和面向 `main` 的 PR 上执行测试及构建。仓库当前没有生产自动部署工作流，CI 成功不代表已部署到服务器。

## 安全说明

- JWT 密钥缺失拒绝启动，无任何兜底值；修改密码后旧 token 立即失效
- 上传文件名白名单校验 + ZIP 解压路径穿越（ZIP slip）防护
- 讲义 HTML 默认消毒（剥离脚本 / 内联事件 / 危险协议链接），iframe 沙箱不允许 `allow-same-origin`；目录与进度经限定来源的消息通信，打印使用消息桥接
- 内容通过短期 HttpOnly/Secure 只读 Cookie 访问，写入仍需 Authorization。私有文件、封面、笔记和搜索结果均检查当前权限；浏览器兼容性需在部署 HTTPS 环境验证。
- 普通上传异常有补偿回滚；断电或 SIGKILL 时文件系统与 SQLite 的联合原子性仍需恢复日志及备份保障。
- 讲义内容安全扫描报告随上传结果展示，供管理员决策

## 许可

[Apache-2.0](LICENSE) © TechDou
