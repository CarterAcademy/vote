# 部署、定时任务与备份恢复

## 1. 推荐生产拓扑

- 两个或以上应用实例（如需高可用），位于 HTTPS 反向代理/负载均衡之后；会话应可跨实例验证。
- 独立 PostgreSQL（建议托管数据库或有监控、PITR 的主备集群），不与公网直连。
- 外部调度器调用自动关票接口；不要在每个 Web 实例内部各跑不受控的 `setInterval`。
- 每日逻辑备份到本机短暂落盘后，复制到加密、异地、限制删除权限的备份存储。
- 测试、预发布、生产使用独立数据库、钉钉应用和密钥。

`docker-compose.yml` 适合单机演示或验收。生产可沿用镜像，但数据库、Secret、监控和备份应接入单位现有平台。

## 2. PostgreSQL 初始化

建议 PostgreSQL 15+，应用和 `pg_dump` 的主版本应相同或让 `pg_dump` 不低于服务器主版本。数据库编码使用 UTF-8，系统/数据库时间使用 UTC。

以数据库管理员身份执行（名称可按单位规范调整，密码必须替换）：

```sql
CREATE ROLE committee_vote LOGIN PASSWORD '<由密码系统生成的强密码>';
CREATE DATABASE committee_vote
  OWNER committee_vote
  ENCODING 'UTF8'
  TEMPLATE template0;
REVOKE ALL ON DATABASE committee_vote FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE committee_vote TO committee_vote;
```

生产连接使用 TLS；口令含 `@`、`:`、`/`、`#` 等字符时，在 `DATABASE_URL` 中必须 URL 编码。不要通过聊天、工单正文或 shell history 传递真实连接串。

部署新版本时先备份，再在同版本代码上执行：

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

数据库迁移先在预发布和最新备份的恢复副本上演练。不可逆迁移需要单独变更窗口和回滚方案。

## 3. 生产组织初始化（首次冷启动）

迁移只创建表结构，不会凭空知道企业里的 HR 和委员。首次生产部署必须在任何用户登录之前完成组织初始化：

1. 将 `config/organization.example.json` 复制到仓库之外的权限受控路径，例如 `/etc/committee-vote/organization.json`。
2. 填入真实钉钉稳定 userId、姓名、部门和职务。不能把手机号、昵称或示例占位符当 userId。
3. 由 HR 和钉钉管理员双人复核：至少 1 名 HR、`ACADEMIC` 恰好 10 人、`TECHNICAL` 恰好 9 人，同一角色名单内的 userId 唯一；同一人可同时配置为 HR 和委员会成员。
4. 确认 `DATABASE_URL` 指向目标生产库，再显式增加 `--confirm` 执行。

宿主机方式：

```bash
DATABASE_URL='<从 Secret Manager 注入>' \
npm run db:provision -- --file /etc/committee-vote/organization.json --confirm
```

Docker Compose 方式（只读挂载名单文件，不把真实名单打进镜像）：

```bash
docker compose --profile tools run --rm \
  --volume /etc/committee-vote/organization.json:/run/provision/organization.json:ro \
  migrate npm run db:provision -- \
  --file /run/provision/organization.json --confirm
```

成功输出应明确显示实际 `hrCount`、`academicCount: 10`、`technicalCount: 9`。随后通过只读查询/测试账号确认角色，再开放 H5 登录。

生产环境禁止执行 `npm run db:seed`，该命令只提供演示数据。初始化命令用于空库冷启动；后续成员变更需走经审批的业务流程。当前脚本会 upsert 配置中的人员，但不会自动停用配置里遗漏的旧成员，因此不能把它当作无差别“全量同步/删除”工具。重复运行或换届前先备份并复核数据库实际有效名单。

## 4. Docker Compose 部署参考

将密钥放到权限为 `0600` 的部署环境文件或平台 Secret 中。Compose 变量至少包括：

```dotenv
POSTGRES_DB=committee_vote
POSTGRES_USER=committee_vote
POSTGRES_PASSWORD=<数据库原始强密码>
DATABASE_URL=postgresql://committee_vote:<URL编码后的同一密码>@db:5432/committee_vote
SESSION_SECRET=<随机值>
MAINTENANCE_SECRET=<另一随机值>
DINGTALK_CORP_ID=<实际值>
DINGTALK_CLIENT_ID=<实际值>
DINGTALK_CLIENT_SECRET=<实际值>
DINGTALK_ROBOT_CODE=<按实际能力填写>
DINGTALK_APP_BASE_URL=https://<正式域名>
BACKUP_RETENTION_DAYS=3650
FILE_STORAGE_DIR=/app/uploads
```

投票附件保存在应用服务器的私有持久化目录中，不应由 nginx 或静态文件目录直接暴露。Compose 使用 `vote_uploads` 命名卷；宿主机发布脚本使用 `/srv/committee-vote/uploads`，并把每个 release 的 `uploads` 链接到该目录。附件目录需要纳入与数据库一致的备份、恢复和访问控制流程。

首次部署或升级：

```bash
docker compose build
# 仅首次冷启动：按上一节挂载真实 organization.json 并执行 db:provision
docker compose up -d app
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

`app` 将等待一次性的 `migrate` 服务成功完成后再启动，因此数据库迁移不会占用首个业务请求，也不会由多个 Web 实例并发执行。迁移失败时应用不会启动；请先检查迁移日志并按发布/回滚流程处理。

`DATABASE_URL` 中使用 `db` 是因为应用在 Compose 网络内连接数据库。数据库服务不映射宿主机端口。

本仓库当前生产机为 `ubuntu@10.1.131.51`。从仓库根目录运行 `./deploy.sh` 会先执行本地发布检查，再把代码同步为 `/srv/committee-vote/releases/` 下的新版本、备份已有数据库、使用服务器内置 Node 22 构建、原子切换 `current` 链接并重启 `committee-vote.service`，最后检查应用和调研报告 URL。生产 Secret 保存在服务器的 `/srv/committee-vote/app.env`（权限 `0600`），部署脚本不会上传或覆盖该文件。

调研报告随应用镜像发布，nginx 地址为：

```text
http://10.1.131.51/investigation-summary.html
```

## 5. HTTPS 反向代理

参考 [infra/nginx/committee-vote.conf.example](../infra/nginx/committee-vote.conf.example)。替换正式域名和证书路径后再启用。

当前内网生产机的 HTTP 配置为 [infra/nginx/committee-vote.production.conf](../infra/nginx/committee-vote.production.conf)。nginx 的 `/` 已由其他系统使用，因此部署脚本只把精确路径 `/investigation-summary.html` 代理到 Committee Vote 的 `10.1.131.51:3000`，不会接管其他 URL。配置正式域名和证书后，应切换到 HTTPS 示例并更新钉钉应用基地址。

- 强制 HTTP 跳转 HTTPS，启用 HSTS 前先确认所有子域均支持 HTTPS。
- 限制请求体大小和合理超时。
- 透传 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`。
- 不记录 Cookie、Authorization、临时 `authCode`、意见正文和应用密钥。
- 管理接口仍需应用层权限；不能只依靠一个“隐藏 URL”。

## 6. 自动关闭定时任务

推荐每分钟调用一次，接口必须幂等：

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-maintenance-secret: ${MAINTENANCE_SECRET}" \
  "https://vote.example.com/api/internal/maintenance/close-expired"
```

传统 cron 示例（让 cron 读取 root-only 环境文件，避免把秘密写进 crontab）：

```cron
* * * * * . /etc/committee-vote/maintenance.env && /usr/bin/curl --fail --silent --show-error --request POST --header "x-maintenance-secret: ${MAINTENANCE_SECRET}" "${APP_BASE_URL}/api/internal/maintenance/close-expired" >> /var/log/committee-vote-autoclose.log 2>&1
```

`/etc/committee-vote/maintenance.env`：

```sh
APP_BASE_URL='https://vote.example.com'
MAINTENANCE_SECRET='<与应用相同的真实值>'
```

文件需 `root:root 0600`。日志由 logrotate 管理，且接口响应不得包含敏感数据。监控应在连续 2～3 次失败时告警。无论 cron 是否正常，提交接口都必须按 `deadline_at` 拒绝过期提交。

## 7. 每日 `pg_dump` 备份

仓库提供 [scripts/backup-db.mjs](../scripts/backup-db.mjs)。它：

- 调用系统 `pg_dump` 生成可供 `pg_restore` 使用的 custom-format 文件；
- 使用临时文件，成功后原子改名；
- 为每个备份生成 SHA-256 校验文件；
- 只清理 `committee-vote-*.dump` 命名且超过配置天数的旧副本；
- 不把连接串打印到日志或传入 `pg_dump` 的命令行参数。

宿主机方式：

```bash
sudo install -d -m 0700 -o <运行备份的系统用户> -g <运行备份的系统组> /var/backups/committee-vote

DATABASE_URL='<从 Secret Manager 注入>' \
BACKUP_DIR='/var/backups/committee-vote' \
BACKUP_RETENTION_DAYS='3650' \
node /opt/committee-vote/scripts/backup-db.mjs
```

也可不用 URL，改由标准 `PGHOST`、`PGPORT`、`PGUSER`、`PGPASSWORD`、`PGDATABASE` 和 `PGSSLMODE` 提供连接。`PG_DUMP_BIN` 可指定已审核的 `pg_dump` 绝对路径。

Docker Compose 方式：

```bash
docker compose --profile tools run --rm backup
```

每日 02:15 cron 示例：

```cron
15 2 * * * cd /opt/committee-vote && /usr/bin/docker compose --profile tools run --rm backup >> /var/log/committee-vote-backup.log 2>&1
```

Compose 把备份写入命名卷 `vote_backups`。生产还必须把新备份异步复制到异地加密存储；仅保存在同一台主机/同一 Docker 卷不算合格备份。

`BACKUP_RETENTION_DAYS` 只控制本地逻辑备份副本，不能触发业务表记录删除。长期留存策略应由数据责任人批准，例如每日副本保留一段时间、月/年归档长期保留；如要求十年，应明确为 `3650` 天或采用等效分层归档，并评估容量和法规要求。

## 8. 恢复演练

恢复到独立数据库，禁止直接覆盖当前生产库。示例：

```bash
cd /var/backups/committee-vote
sha256sum --check committee-vote-20260717T021500000Z.dump.sha256

createdb --host <restore-host> --username <admin-user> committee_vote_restore
pg_restore \
  --host <restore-host> \
  --username <restore-user> \
  --dbname committee_vote_restore \
  --clean --if-exists --no-owner --no-privileges \
  committee-vote-20260717T021500000Z.dump
```

macOS 可用 `shasum -a 256 -c <file>.sha256`。恢复工具版本不应低于生成备份的 `pg_dump` 主版本。

恢复后执行：

1. 迁移版本/表结构检查通过；
2. 场次、名单快照、当前票、修订历史、审计日志数量合理；
3. 抽查一场投票的统计与导出一致；
4. HR 能看明细，委员不能读取汇总/他人记录；
5. 在隔离环境执行一次到期自动关闭；
6. 记录恢复时间（RTO）、可恢复时间点/最大丢失窗口（RPO）、负责人和结果；
7. 销毁恢复副本时遵循经批准的安全删除流程。

至少每季度做一次恢复演练。只有“备份任务显示成功”但从未恢复验证，不能证明数据可恢复。

## 9. 监控和日常巡检

- `/api/health` 可用率和延迟；应用 5xx、登录失败、数据库连接池耗尽。
- 自动关票任务最后成功时间、关闭场次数、连续失败次数。
- 催票发送成功率、限流/权限失败；不得在指标标签中放姓名或意见。
- 备份最后成功时间、文件大小异常、SHA-256 生成结果、异地复制状态、存储容量。
- PostgreSQL 可用性、连接数、慢查询、磁盘、WAL/归档（如启用 PITR）。
- 每日抽查当日到期投票是否已关闭；每月复核 HR 和应用管理员权限。

## 10. 发布与回滚

1. 记录待发布 commit/镜像 digest，备份数据库。
2. 在预发布跑迁移、构建、测试和完整验收脚本/清单。
3. 先执行向后兼容数据库迁移，再滚动发布应用。
4. 观察健康检查、登录、提交、统计、催票和定时任务。
5. 应用回滚到上一镜像；数据库回滚只按事先审核的迁移方案执行，不能临时直接删列/还原生产库。

紧急情况下可暂时禁止新建/提交，但必须保留只读历史查询与审计。事故处理期间不要清空日志或改写投票数据。
