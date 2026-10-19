# Operations export security review — 15 October 2026

Scope: the proposed Supabase → Google Sheets operations backup, including SQL, Edge Function, Apps Script, permissions, and changed/new-file credential checks. This is a local code review with automated tests, not a penetration test or verification of deployed Supabase/Google settings. No customer export or deployment was performed.

## Changes made during review

1. **Reduced Google authorization.** Replaced account-wide `spreadsheets` access with `drive.file`. The script creates its own workbook and uses the advanced Sheets service, so it does not need to access all the owner's spreadsheets. Added advanced Drive service only to inspect sharing metadata. No Gmail/Mail or account-wide Drive scope is requested. This follows [Google's recommended per-file scope](https://developers.google.com/workspace/sheets/api/scopes).
2. **Fail closed on broad sharing.** Before fetching customer data and immediately before publication, the script inspects the workbook's permissions and rejects public/anyone, domain-wide, unknown or unverifiable access. It allows explicitly shared users/groups and does not silently modify permissions.
3. **Bound database copying.** Enforced the 50,000-row limit for each dataset inside the database before copying. A second check rolls back the snapshot if concurrent inserts push the captured dataset over the limit. There is no silent truncation. Existing snapshot concurrency and page-size bounds remain.
4. **Reduced failed-run retention.** Failed staging tabs are removed immediately on a best-effort basis, with another cleanup next run. Cleanup rereads tab names so it cannot delete tabs already published after an ambiguous network response. The last successful copy remains intact.

## Controls verified

- Missing/incorrect export secret denies access before database calls; missing server configuration fails closed. Requests are POST-only, bounded to 2 KB, UUID/cursor validated, and restricted to two named export RPCs.
- The export secret permits retrieval of the operational snapshot; it cannot invoke order-payment/collection updates through this endpoint. SQL RPC names and arguments are allowlisted and parameterized.
- Snapshot tables have RLS and no browser-role grants. Actual `SET ROLE anon` and `SET ROLE authenticated` reads and snapshot creation attempts fail with permission errors in the PostgreSQL test database. The migration is rerunnable. These controls follow [Supabase's grant-plus-RLS model](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Explicit column/metadata projections exclude balance-link token hashes, raw arbitrary activity metadata and provider credentials.
- The Supabase service role credential stays in the Edge Function environment. Google receives only the dedicated export secret. Request URLs are restricted to hosted Supabase endpoints; redirects are disabled on both outbound network paths.
- Google cell values use RAW input. Formula-like customer text remains text; leading-zero postcodes survive. Errors/status messages omit customer payloads, credentials and raw provider responses.
- Immutable snapshot pagination and atomic publication keep both live tabs consistent. Failed/incomplete copies do not replace the live tabs; repeated successful copies do not append duplicate orders.
- No matches to configured `.env.local` secret/token/service-role/password values were found in the changed/new files scanned. `.env.local` is ignored and untracked. This is not a historical Git secret scan or proof that every possible secret pattern is absent.

## Dependency scan

`npm audit --omit=dev --json` on the review date reported **zero production dependency advisories**. No dependencies were added for the export.

The full `npm audit --json` reported **five high-severity development dependency findings** along the Next ESLint → fast-glob → micromatch → braces chain. The underlying advisory is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), concerning denial of service from deeply nested patterns. These packages are development/lint tooling, not production dependencies. They remain unresolved; npm's proposed automatic fix downgrades `eslint-config-next` to 14.2.35, so it was not applied to the Next 16 project. Limit CI/linting of untrusted input and revisit a compatible upstream fix. A clean production audit is not a guarantee of vulnerability-free software.

## Verification and remaining setup checks

Automated coverage includes authentication denial, browser-role denial, excluded secrets, migration reruns, immutable paging/expiry, oversized snapshot rollback, safe spreadsheet values, limited OAuth scopes, broad-sharing rejection, cleanup and failed-run preservation. The complete application suite passes 36 tests; lint and application type checking pass. Google API behaviour is mocked in local tests; actual OAuth grants, sharing checks, deployed Edge Function authentication and one restricted-workbook export must still be verified during setup.

Before enabling the timer:

- Use the revised SQL, `Code.gs` and manifest. If an older manifest was authorized, revoke that project's old Google connection and reauthorize the revised scopes; see the owner setup guide.
- Keep the workbook Restricted, general staff as Viewers, and the standalone script private to trusted maintainers. Enable two-factor authentication for its owner. Review any named groups' membership.
- Generate a fresh dedicated export secret; never reuse or share provider credentials. Both the secret and script-edit access can expose the entire operational copy.
- Test unauthorized function requests, restricted sharing and a manual successful export against the actual deployment before installing the timer.

The sharing checks are point-in-time checks: they cannot prevent an owner sharing data later, undo a download, or retract older Google copies. Hidden tabs are not an access boundary. Snapshot pages expire after two hours, but physical database cleanup occurs at the next export start. Google version history has its own retention. Existing backups contain contact/address/payment-reference information intentionally and require the same access discipline as the admin dashboard. Daily backups can be stale; they are not an authoritative live collection ledger.

Setup: [Owner guide](google-sheets-operations-backup.md).
