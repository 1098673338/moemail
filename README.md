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

Set `WORKER_NAME` only to override the default main Worker name, `moemail`.

The workflow exports remote D1 before migrations, builds, and deploys only the
main Worker. It fails if a required secret, migration, or deployment fails. The
main Worker can be created as the approved Pages replacement; no D1, KV, or
Email Routing resource is created.

Verify the Workers preview URL before moving the existing custom domain from
Pages to the main Worker. Live iCloud/IMAP validation requires the deployed
Worker and existing credentials.
