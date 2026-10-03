<div align="center">

# EduManager

**在线教育讲义管理平台**

上传、分类、分发课程资料，学生随时随地在线学习。

</div>

## 项目简介

EduManager 面向教育机构，管理员上传 ZIP/HTML 讲义包并管理章节、分类和班级权限；学生在线阅读获授权的课程与知识库资料。

- **讲义管理**：上传预检、进度反馈、封面与分类，替换失败保留原内容，保留一份上一版本供回退。
- **权限分级**：公开精选与班级×分类授权，讲义、附件、封面、目录及知识库均检查访问权限。
- **在线学习**：章节与目录导航，按标题、分类、章节搜索，记录阅读位置、手动标记章节完成、查看最近学习。
- **知识库**：飞书链接及 Markdown/PDF 预览，可分别设置公开状态。
- **管理后台**：讲义、分类、用户、班级和数据统计管理。
- **使用反馈**：模块加载失败可独立重试，登录后返回原页面，上传失败保留表单便于重试。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 · Vite · Vue Router · Axios · Markdown-it · Mermaid |
| 后端 | Node.js · Express · better-sqlite3（SQLite + WAL） |
| 认证 | JWT 登录凭证 · 短期 HttpOnly 内容会话 |
| 文件 | Multer · AdmZip · 工作线程内 ZIP 校验与解压 |

## 快速开始

### 环境要求

- Node.js **≥ 22.9.0**，使用 npm 安装锁文件依赖。
- ZIP 解压由应用处理，无需安装 `unzip` 或 `unar`。
- 生产环境使用 HTTPS。私有讲义附属资源需要浏览器支持 Secure Cookie、SameSite=None 和讲义沙箱相关能力；本地使用 `localhost` 或 `127.0.0.1`。Safari 的 HTTP 本地地址不能依赖 Secure Cookie 例外行为，应使用本地 HTTPS。Safari/Firefox 还需在部署 HTTPS 环境验证，浏览器兼容性以实际使用环境为准。

### 安装与开发

```bash
git clone https://github.com/techdou/edumanager.git
cd edumanager
npm ci
npm --prefix client ci

cp .env.example .env
# 编辑 .env，设置随机 JWT_SECRET
npm run dev
```

前端开发地址为 `http://localhost:3001`，后端默认 `:3142`。`server`、`server:prod`、`verify` 和 `backup` 命令通过 Node 的 `--env-file-if-exists` 可选加载项目根 `.env`；已有环境变量优先。直接运行 `node server/index.js` 不会自动读取 `.env`。

本地开发缺少密钥时会警告并使用开发默认值；生产模式拒绝缺失、模板值或不足 32 字符的密钥。建议生成 48 字节随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 构建与生产启动

```bash
npm run build
npm run server:prod
```

后端托管 `client/dist/`。生产启动先执行版本迁移与数据库校验，再等待全量备份完成，最后监听端口；任一步失败会拒绝启动。反向代理应配置 HTTPS，并正确转发 `/api`、`/lectures` 和 `/content-bridge.js`。进程管理器必须使用单实例，环境变量加载方式须与上述命令保持一致。

## 配置

见 [`.env.example`](.env.example)。相对路径按进程工作目录解析。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 开发专用默认值 | 生产必须设置强随机密钥 |
| `NODE_ENV` | 非生产 | `production` 启用严格密钥校验及启动备份 |
| `PORT` | `3142` | 后端端口 |
| `CORS_ORIGIN` | 允许所有来源 | 逗号分隔的来源白名单，生产建议显式设置 |
| `DATA_DIR` | 项目根 `data/` | 数据库、知识库、封面、版本元数据 |
| `LECTURES_DIR` | 项目根 `lectures/` | 当前讲义与上一版本内容 |
| `UPLOADS_DIR` | `<DATA_DIR>/uploads` | 上传临时文件 |
| `BACKUP_DIR` | `<DATA_DIR>/backups` | 全量备份目录 |
| `BACKUP_RETENTION` | `7` | 保留备份数量，必须为正整数 |
| `LOG_LEVEL` | `info` | `error`、`warn`、`info` 或 `debug` |

## 数据、升级与恢复

数据库位于 `<DATA_DIR>/edumanager.db`，使用 WAL、事务及外键检查。`schema_migrations` 记录已应用的迁移版本，启动时事务执行缺失的迁移。新学习进度表具有外键约束；历史表的孤立关联通过审计报告，不静默删除。完整性或实际外键检查失败会阻止启动。

升级前先停止旧服务并保留代码及完整的数据、讲义目录副本。启动备份发生在迁移之后，不能替代升级前恢复点。现有知识库中 `is_public=0` 的资料在升级后按私有权限展示，管理员需显式开启“公开展示”才能向匿名用户开放。

阅读位置与完成状态按账号保存在服务器，浏览器保留有限缓存用于加载失败时恢复显示。滚动到底不会自动标记完成。替换讲义或回退版本会重建章节，原章节的学习进度随之重置；回退保留当前讲义的分类、公开状态及访问地址。

### 离线全量备份

**先停止服务，再执行备份。** 数据目录锁只允许一个服务或维护写进程，在线服务运行时备份命令会拒绝执行。

```bash
npm run backup
# 输出生成的备份目录，例如 /srv/edumanager/data/backups/实际备份目录
npm run verify:backup -- /srv/edumanager/data/backups/实际备份目录
```

备份包含数据库、当前及历史讲义、知识库、封面和讲义版本元数据，以及文件大小和 SHA-256 校验清单。备份先写暂存目录，验证后发布，并按 `BACKUP_RETENTION` 保留最近备份。临时上传文件不作为业务资料备份。

```bash
npm run restore -- /srv/edumanager/data/backups/实际备份目录 /srv/edumanager-restored
```

恢复目标必须是**不存在或全新的空目录**，不能覆盖现有实例。脚本验证文件清单、哈希与数据库完整性后，恢复到 `<目标>/data` 和 `<目标>/lectures`。检查恢复结果后，设置 `DATA_DIR` 与 `LECTURES_DIR` 指向新目录再启动；确认原有 `BACKUP_DIR`、`UPLOADS_DIR` 配置是否仍适用。恢复命令只恢复文件，不自动切换服务。

### 验证命令

```bash
npm test             # 上传、权限、进度、迁移、备份与前端逻辑回归
npm run test:smoke   # 隔离目录中的 API 冒烟验证
npm run test:tx      # 临时数据库中的事务回滚验证
npm run check        # 服务端、脚本与测试语法检查
npm run build        # 前端生产构建
npm run verify       # 当前配置数据库的只读完整性与历史孤立关联审计
```

测试使用临时数据库和目录，不读取真实 `.env`。`verify` 是针对实际配置数据库的审计，发现异常返回非零退出码。`GET /health` 检查数据库可查询性，正常返回 200，查库失败返回 503；它不代表所有学习功能均正常。

## 安全与运行边界

- 上传前限制包大小、解压后体积、条目数、目录深度、压缩比和处理时间，拒绝路径穿越、符号链接及重复路径。默认上限为上传 200 MiB、单文件 64 MiB、解压总量 512 MiB、5000 个条目、32 层目录、60 秒处理时间。
- 上传先校验、暂存，再切换文件与提交数据库；普通异常有补偿回滚。文件系统和 SQLite 不是同一事务，不能保证 SIGKILL、断电等中断场景下的联合原子性，应结合已验证备份恢复。
- 讲义 iframe 与内容 CSP 允许脚本及 `allow-same-site-none-cookies`，不授予 `allow-same-origin`；上传脚本不能读取应用的同源存储。目录定位、阅读位置通过限定消息来源的 `postMessage` 通信。
- 内容会话有效期最多 30 分钟且不超过登录有效期，Cookie 为 HttpOnly、Secure；讲义路径使用 SameSite=None，知识库及封面 API 路径使用 SameSite=Strict。内容凭证只接受 GET/HEAD，业务写入仍需 Authorization，不接受 URL 查询参数中的 token。
- 当前面向单进程、本地磁盘部署。异地备份、自动停服备份流程、容量告警及多实例部署需结合生产环境补充，详见 [ROADMAP.md](ROADMAP.md)。

## 目录与文档

```text
server/       Express 路由、认证、数据库、上传与备份工具
client/       Vue 页面与组件、学习进度及内容会话逻辑
scripts/      备份、验证、恢复及隔离测试入口
test/         Node 回归测试
data/         运行时数据库及资料（自动创建，不纳入 Git）
lectures/     讲义及历史内容（自动创建，不纳入 Git）
```

- [UPGRADE_PLAN.md](UPGRADE_PLAN.md)：本次升级范围、分工及验收记录。
- [DESIGN.md](DESIGN.md)：权限、内容会话及学习进度设计。
- [ROADMAP.md](ROADMAP.md)：已实现能力及后续升级条件。

## License

MIT
