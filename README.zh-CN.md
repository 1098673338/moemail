# Mailbox Studio

Mailbox Studio 是 iCloud 邮箱管理应用，运行在现有 D1 绑定的 Cloudflare
Worker 上；仓库不会创建任何 Cloudflare 资源。

## 功能

- iCloud 账户连接、别名同步、IMAP 邮件同步、UIDVALIDITY 保护、远端删除校验、
  地址标签和备注。
- iCloud 邮件使用 `source = 'icloud'`。历史 D1 行和兼容字段会保留，但新应用
  不会读取它们。

## 本地检查

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run build:worker
pnpm exec wrangler d1 migrations apply moemail --local --config wrangler.jsonc
pnpm run preview:worker
```

## 手动 GitHub Actions 发布

在仓库 Secrets 配置以下值后手动执行 **Deploy**：

- `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_NAME`、`DATABASE_ID`
- 现有的 `EXTERNAL_MAIL_SECRET`

主应用默认 Worker 名称为 `moemail`，只有需要改名时才配置 `WORKER_NAME`。

工作流会先导出远端 D1，再执行迁移、构建并部署主应用 Worker。任一必需 Secret、
迁移或部署失败都会失败退出。主应用 Worker 可以首次创建以替代 Pages；D1、KV 和
Email Routing 不会被创建。

先验证 Workers 预览地址，再将现有自定义域名从 Pages 切到主 Worker。真实 iCloud
IMAP 验收需要已部署 Worker 与既有凭据。
