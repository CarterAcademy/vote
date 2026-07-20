# 两委会人选评审投票系统

面向钉钉企业内部应用的轻量评审投票系统。委员从钉钉 H5 页面进入，系统自动识别身份；HR 在管理端发起、查看进度、催票、关闭和导出。正式数据保存在 PostgreSQL，不依赖钉钉群消息的保留期限。

## 已确认的业务规则

- 每场只评审一位人选；`candidateName`（人选姓名）是结构化字段，不能藏在投票标题中。
- 固定选项：通过、不通过、弃权。通过/不通过必须填写意见，弃权可以不填。
- 记名投票；只有 HR 可以查看个人选择和意见。委员在投票期间看不到汇总或他人的投票。
- 委员在截止/关闭前可以修改投票；每次修改保留完整历史。
- 系统只提供票数和比例统计，不自动判定“通过”。
- HR 可以在未全员投票时手动关闭，并可一键私聊提醒尚未投票的委员。
- 每场投票必须设置截止时间；到期由定时任务自动关闭。
- 业务记录长期保留并每日备份。业务数据保留期和备份副本保留期是两个独立策略。

## 技术栈与结构

- Next.js 15、React 19、TypeScript（Node.js 22）
- PostgreSQL + Kysely
- 钉钉企业内部 H5 微应用免登；本地提供显式的 mock 登录
- Vitest；Docker 多阶段构建；`pg_dump` 自定义格式备份

主要文档：

- [架构与数据边界](docs/architecture.md)
- [钉钉企业内部应用配置](docs/dingtalk-setup.md)
- [部署、定时任务与备份恢复](docs/deployment-operations.md)
- [安全与隐私检查清单](docs/security-privacy.md)
- [上线验收清单](docs/acceptance-checklist.md)

## 本地演示（无需真实钉钉）

前置：Node.js 22+、npm。

```bash
cp .env.example .env.local
npm install
npm run dev
```

保持以下配置：

```dotenv
DATABASE_URL=
DINGTALK_MOCK_ENABLED=true
```

然后打开 [http://localhost:3000](http://localhost:3000)，从演示登录页选择 HR 或委员身份。没有 `DATABASE_URL` 时，应用会自动创建并填充内存演示数据库；重启开发进程后数据会重置。mock 模式只用于本机开发和演示，不得在公网或生产环境启用。

调研摘要可在本地开发模式通过 [http://localhost:3000/investigation-summary.html](http://localhost:3000/investigation-summary.html) 查看。

如需用本地 PostgreSQL 做持久化联调，设置 `DATABASE_URL` 后另行执行 `npm run db:migrate`；只有明确需要演示数据时才运行 `npm run db:seed`，不要对生产数据库执行 seed。

常用检查：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 生产配置概览

生产环境至少设置：

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://<app-user>:<url-encoded-password>@<db-host>:5432/<db-name>?sslmode=require
SESSION_SECRET=<至少 32 字节的随机值>
DINGTALK_MOCK_ENABLED=false
DINGTALK_CORP_ID=<租户实际 CorpId>
DINGTALK_CLIENT_ID=<内部应用实际 ClientId/AppKey>
DINGTALK_CLIENT_SECRET=<内部应用实际 ClientSecret/AppSecret>
DINGTALK_ROBOT_CODE=<如所选私聊能力要求，则填写实际 robotCode>
DINGTALK_APP_BASE_URL=https://vote.example.com
MAINTENANCE_SECRET=<独立的高强度随机值>
BACKUP_DIR=/var/backups/committee-vote
BACKUP_RETENTION_DAYS=<按单位制度填写，例如 3650>
```

不要把 `.env*`、数据库口令、钉钉应用密钥或维护密钥提交到仓库。建议由部署平台的 Secret Manager 注入。完整步骤见[部署与运维文档](docs/deployment-operations.md)。

## Docker 快速验证

`docker-compose.yml` 是单机/验收环境参考，不代替生产高可用设计。先在部署机的受控环境文件中提供 Compose 所需变量，再执行：

```bash
docker compose build
# 首次部署还需按“生产组织初始化”导入真实 HR 和委员名单
docker compose up -d app
docker compose ps
```

Compose 会先运行一次性迁移服务，迁移成功后才启动应用。应用请求路径本身不会执行持久化数据库迁移。

反向代理必须终止 HTTPS，并只将应用端口暴露给代理。PostgreSQL 不对公网开放。

### 生产组织初始化（仅首次冷启动）

把 `config/organization.example.json` 复制到仓库之外的受控路径，填写真实的钉钉用户 ID、姓名和组织信息。配置必须包含至少 1 名 HR、恰好 10 名学术委员会委员和 9 名技术委员会委员，且用户 ID 不得重复。

在迁移后、任何用户首次登录前执行：

```bash
npm run db:provision -- --file /secure/path/organization.json --confirm
```

真实名单文件按敏感配置管理，不提交仓库。生产环境不得执行 `npm run db:seed`；它只用于非生产演示数据。完整的宿主机和 Docker 操作见[部署与运维文档](docs/deployment-operations.md#3-生产组织初始化首次冷启动)。

## 维护接口

- `GET /api/health`：健康检查；不得返回秘密或个人数据。
- `POST /api/internal/maintenance/close-expired`：关闭已过截止时间但仍为 OPEN 的投票，请求头为 `x-maintenance-secret`。
- `POST /api/polls/:id/remind`：HR 一键提醒，由服务端重新计算未投名单；客户端不能传任意收件人。
- `POST /api/auth/dingtalk`：H5 将钉钉客户端取得的临时 `authCode` 交给服务端换取身份会话。

除健康检查外，这些接口都必须在服务端完成鉴权、授权和审计，不能只依靠页面隐藏按钮。
