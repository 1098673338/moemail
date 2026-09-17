# Mailbox Studio

Mailbox Studio combines iCloud Mail management with public temporary mailboxes.
The app runs as a Cloudflare Worker backed by an existing D1 database and KV
namespace. Existing Email Routing, `email-receiver`, and `cleanup` Workers are
reused; this repository does not create Cloudflare resources.

## Features

- iCloud account connection, alias synchronisation, IMAP message synchronisation,
  UIDVALIDITY protection, local/remote deletion checks, tags and address notes.
- Public temporary mailbox generation, prefix and domain selection, expiry,
  message reading, HTML/text display, code extraction, read state and cleanup.
- One merged `message` table: iCloud rows have `source = 'icloud'`; temporary
  rows have `source = 'temporary'` and `emailId`.

## Local verification

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run build:worker
pnpm exec wrangler d1 migrations apply moemail --local --config wrangler.jsonc
pnpm run preview:worker
```

For local temporary-mailbox testing, add `EMAIL_DOMAINS` to the local
`SITE_CONFIG` KV binding, for example:

```sh
pnpm exec wrangler kv key put EMAIL_DOMAINS 'example.test' --binding SITE_CONFIG --local
```

## Manual GitHub Actions release

Run the **Deploy** workflow manually after adding these repository secrets:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_NAME`, `DATABASE_ID`, `KV_NAMESPACE_ID`
- `EXTERNAL_MAIL_SECRET` (the existing MoeMail secret)

Optional: set `EMAIL_RECEIVER_WORKER_NAME` and `CLEANUP_WORKER_NAME` only if
your existing Workers are not named `email-receiver-worker` and `cleanup-worker`.
Set `WORKER_NAME` only to override the default main Worker name, `moemail`.

The workflow exports remote D1 before migrations, verifies the existing email
receiver and cleanup Workers, builds the main Worker, and deploys all three
Workers. It fails if a required resource,
migration, or deployment fails. The main Worker can be created as the approved
Pages replacement; no D1, KV, Email Routing, or auxiliary Worker is created.

Verify the Workers preview URL before moving the existing custom domain from
Pages to the main Worker. Live iCloud/IMAP and real inbound-email validation
require the deployed Worker and existing credentials/routing.
