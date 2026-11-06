# Ervisio Backup

The official Linux backup plugin for **Ervisio 7.0.3+**, with shared Classic and
native ErvisiOS pages. Save folders, PostgreSQL, MySQL/MariaDB or consistent
SQLite snapshots to an existing SFTP or SMB network folder.

- Multiple source folders and databases per plan, optional exclusions.
- Minutes, hours, days or true calendar months; adjustable copy-count/age retention.
- Persistent Ervisio jobs continue after logout. Back up now uses a reusable
  background job and does not postpone the next scheduled run.
- Private per-user settings, AES-GCM sealed saved database passwords, no secrets
  in command arguments or saved browser preferences.
- Exclusive temporary upload then rename, SHA-256 sidecar and authenticated
  ownership manifests. Retention only manages the plan's proven archive pairs,
  preserving unrelated files and at least one good backup.
- Real client availability, connection checks, remote folder browser and run history.

Create and trust an SFTP/SMB connection in **Files** first. Install `pg_dump`,
`mysqldump`/`mariadb-dump` or Python 3 when the chosen database needs it; the page
reports missing clients and explains where to find them in Software. Docker databases are supported
through published TCP ports, not direct container execution. Linux is currently
required; Windows shows an explicit unsupported message.

The worker runs with the creating account's rights. It skips links/special files,
aborts changing or unreadable sources, excludes its own private work directory
and enforces source/spool limits. SFTP uses 0700/0600 permissions; SMB follows the
share ACLs. Archives hold actual database data without additional archive-level
encryption. Restore manually into a chosen location and verify SHA-256 first.

See [the core backup API and security contract](https://github.com/Ervisio/ervisio/blob/main/docs/api/backup.md)
for archive layout, consistency, bounds and recovery.

## Development

```sh
npm ci
npm test
npm run build
npm run pack
```

Builds one self-contained module sharing the SDK's React and UI components;
there is no bundled editor/database library. On Windows, `pack` requires GNU tar
(for example the Git for Windows `usr/bin` version). CI validates the packed
manifest with the core's validator and a throwaway key. Load `dist/backup` from
Plugins → Developer on a development core. No signing key belongs in this repo.

The manifest's only file capability is
`~/.config/ervisio/plugins/backup/inbox`; the helper consumes a random bounded
private request and stores encrypted settings outside that capability. Other
commands take fixed methods and hex-only tokens/IDs. Background jobs are the
existing SDK `api.jobs`, not a custom scheduling process.

Tests cover frequency semantics, blank/clear password behavior, account-isolated
schedule updates, reusable manual jobs and secret-free argv transport. Core
tests cover actual ephemeral SFTP, mocked SMB, consistent SQLite, guarded
retention/recovery and opt-in disposable PostgreSQL/MariaDB dump/restore. No
production database backup is run by the tests.
