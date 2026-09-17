# Mailbox Studio

Mailbox Studio 将 iCloud 邮箱管理与公开临时邮箱整合到同一个 Cloudflare
Worker 应用中。它复用现有 D1、KV、Email Routing、`email-receiver` 和
`cleanup` Worker；仓库不会创建任何 Cloudflare 资源。

## 功能

- iCloud 账户连接、别名同步、IMAP 邮件同步、UIDVALIDITY 保护、远端删除校验、
  地址标签和备注。
- 临时邮箱随机/前缀创建、域名选择、过期、HTML/文本阅读、验证码、已读与自动清理。
- 两类邮件共用 `message`：iCloud 为 `source = 'icloud'`，临时邮箱为
  `source = 'temporary'` 并使用 `emailId` 关联。

## 本地检查

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run build:worker
pnpm exec wrangler d1 migrations apply moemail --local --config wrangler.jsonc
pnpm run preview:worker
```

临时邮箱本地测试前，可向本地 `SITE_CONFIG` KV 写入域名：

```sh
pnpm exec wrangler kv key put EMAIL_DOMAINS 'example.test' --binding SITE_CONFIG --local
```

## 手动 GitHub Actions 发布

在仓库 Secrets 配置以下值后手动执行 **Deploy**：

- `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- `WORKER_NAME`、`DATABASE_NAME`、`DATABASE_ID`、`KV_NAMESPACE_ID`
- `CREDENTIAL_ENCRYPTION_KEY`、`ICLOUD_BRIDGE_TOKEN`

工作流会先导出远端 D1，再执行迁移；它要求
`<WORKER_NAME>-email-receiver-worker` 和
`<WORKER_NAME>-cleanup-worker` 已存在，并构建和部署三个 Worker。任一资源、
迁移或部署失败都会失败退出。主应用 Worker 可以首次创建以替代 Pages；D1、KV、
Email Routing 和两个既有 Worker 不会被创建。

先验证 Workers 预览地址，再将现有自定义域名从 Pages 切到主 Worker。真实 iCloud
IMAP 和真实入站邮件需要已部署 Worker 及既有凭据/路由才能验收。
