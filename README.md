# Mailbox Studio

Mailbox Studio is an iCloud Mail management app. It runs as a Cloudflare Worker
backed by the existing D1 database; this repository does not create Cloudflare
resources.

## Features

- iCloud account connection, alias synchronisation, IMAP message synchronisation,
  UIDVALIDITY protection, local/remote deletion checks, tags and address notes.
- iCloud messages are stored with `source = 'icloud'`. Historical D1 rows and
  compatibility columns are retained, but are not read by the application.

## Local verification

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run build:worker
pnpm exec wrangler d1 migrations apply moemail --local --config wrangler.jsonc
pnpm run preview:worker
```

## Manual GitHub Actions release

Run the **Deploy** workflow manually after adding these repository secrets:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_NAME`, `DATABASE_ID`
- `EXTERNAL_MAIL_SECRET` (the existing MoeMail secret)
- `DASHBOARD_LOGIN_SECRET` (a separate random secret of at least 32 characters)

Generate `DASHBOARD_LOGIN_SECRET` with `openssl rand -hex 32`. Do not reuse
`EXTERNAL_MAIL_SECRET`: it also encrypts saved iCloud credentials.

Keep the original `EXTERNAL_MAIL_SECRET` across version updates and use the same
value in GitHub Secrets and the Cloudflare Worker. Deployment checks that this
key decrypts all existing iCloud credentials before changing secrets or D1 data.
If verification fails, restore the original key instead of generating another.
Temporary sync failures retry with backoff; Settings also offers Retry Connection
without re-entering a password. If the original key is lost, save the existing
App-specific password again after stabilizing the deployment configuration.

Set `WORKER_NAME` only to override the default main Worker name, `moemail`.

The workflow exports remote D1 to the temporary runner before migrations,
builds, and deploys only the main Worker. It does not publish that database
export as a workflow artifact. It fails if a required secret, migration, or deployment fails. The
main Worker can be created as the approved Pages replacement; no D1, KV, or
Email Routing resource is created.

Verify the Workers preview URL before moving the existing custom domain from
Pages to the main Worker. Live iCloud/IMAP validation requires the deployed
Worker and existing credentials.
