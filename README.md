# SRGPL Business Manager

An offline-first PWA for a mobile-recharge / electronics shop, rebuilt from the legacy PHP + MySQL project in
`registeration-login-system-master/`. That folder has been removed from the workspace; a copy is kept as `legacy-php-backup.zip` one level above the project folder.

- React 19 + TypeScript + Vite, installable PWA
- All data is stored **in the browser on the device** (IndexedDB via Dexie). There is no backend, no PHP/MySQL, no cloud database, no sync.
- Static hosting on Netlify.

## Read this first: limits of device-local storage

| Fact | Consequence |
| --- | --- |
| Registration and login are **local to one browser profile**. | An account created on a phone does not exist on a laptop. There is no central identity. |
| There is no e-mail sending. | **No "forgot password" e-mail.** The owner account can reset another user's password; if the owner forgets theirs, restore a backup made earlier (or start again). |
| Data lives in IndexedDB. | Clearing site data, private windows, uninstalling the browser or a low-disk clean-up can erase everything. The app asks the browser for persistent storage, but the browser may refuse. |
| Nothing is synced. | Backups (JSON) are the only way to move or protect data. The dashboard reminds the user when the last backup is old. |

The login screens and the Backup page state this in plain language.

## Scripts

```bash
npm install
npm run dev        # development server
npm run typecheck  # tsc --noEmit
npm test           # vitest (service layer, fake-indexeddb)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally (needed to test the service worker)
```

Node 20 or newer.

## Features

All legacy modules, with create / edit / delete where the original allowed it, plus search, date filters and totals:

Dashboard, Daily Overview, Sales (+ item rates), Sale Returns, Stocks (add / adjust / history), Orders (status + history),
Customers (directory), Credits (credit & payment ledger), Purchases (supplier balances and payments), Expenses (categories + entries),
Cash in Hand, Recharge (networks, recharges, commission), Daily Transactions, UPI Withdraw (+ UPI accounts), Service Jobs (advance /
final / delivery / return), Backup & Restore, Profile, Accounts (owner only).

Cross-cutting: multi-user separation (every record carries `userId`; every service takes `userId` first), PBKDF2-hashed passwords,
login throttle after 5 failures, "remember me" (localStorage) vs. session-only login, live-updating lists, input validation with
clear messages, delete confirmations, toasts, responsive layout, offline indicator, update prompt, install button.

### Backup / restore

- **Download my backup** (one account) or **all accounts on this device** (JSON, with a format/version marker and per-table counts).
- Restore validates the file first (size limit, JSON shape, version, ids, field types), shows a **preview**, and asks for confirmation. Modes: keep existing records and add only missing ones (default), overwrite existing records, or replace this account's data.
- Importing into another account is refused when record ids collide with another user's data. Restoring a full-device backup is only allowed on an empty device (first-run "Restore from a backup file" link).
- CSV export per table (spreadsheet use only, cannot be restored).
- Erase-my-data requires typing `ERASE`.

## Architecture

```
src/
  db/          Dexie schema (db.ts) and record types (types.ts)
  lib/         crypto (PBKDF2), csv, validation, formatting, ids, storage helpers, AppError
  services/    all business rules; plain async functions, each takes userId first
  context/     AuthContext (session), UiContext (toasts, confirm dialog)
  components/  Layout, Modal/FormModal, DataTable, Field, PwaStatus, shared UI
  pages/       one lazy-loaded page per module
  test/        vitest suites (auth, business rules, backup)
```

Dexie database `srgpl-manager`, 25 tables, all keyed by a UUID `id`, with `userId` indexed for multi-user separation.

### Legacy MySQL tables to Dexie tables

| Legacy | Dexie table(s) |
| --- | --- |
| registration / admin / users | `users` (status pending / active / rejected, role owner / staff) |
| customerdetails (+ history) | `customers`, `customerHistory` |
| customers (+ customerhistory) = credit ledger | `credits`, `collections` |
| orders (+ history) | `orders`, `orderHistory` |
| purchase (+ purchasehistory) | `purchases`, `purchaseHistory` |
| stocks (+ stockshistory) | `stocks`, `stockHistory` |
| details (sale/expense item catalog) | `items` |
| detailshistory (sale / expense entries) | `sales`, `expenses` |
| salereturn | `returns` |
| service (+ servicehistory) | `services`, `serviceHistory` |
| networks, rechargehistory | `networks`, `recharges` |
| daily (+ dailyhistory) | `dailyTransactions`, `dailyHistory` |
| withdraw (+ withdrawhistory) | `upiAccounts`, `withdrawals` |
| cashinhand | `cashEntries` |
| (new) | `settings` (backup reminder, last backup time, etc.) |

## Business rules and deliberate deviations from the legacy app

The legacy code was audited and its rules were kept unless they were clearly bugs. Where behaviour differs or a rule had to be
chosen, it is listed here so you can confirm it.

1. **Overview formula.** One formula is used for every date range:
   sales - expenses + service received - service refunds - purchases paid + credit collected - credit given + cash in hand - sale returns + recharge amount + cash commission - bank commission - UPI withdrawals.
   The legacy `overview.php` (today) used this; `overviewfilter.php` (range) was inconsistent (added bank commission, overwrote instead of summing cash commission, mixed `entryDate` and `date` in the purchase query).
2. **Commission report** is summed per network over the range. The legacy page showed only the last row's commission. Networks of type "Other" are excluded, as before.
3. **Daily Transactions**: rows are per network per date and start at zero each day (no carry-over of yesterday's closing). Sales = opening + purchase - closing; closing cannot exceed opening + purchase (so sales are never negative). The legacy `zero.php` reset is replaced by per-date rows.
4. **Ledgers are append-only** (purchase history, credit collections, service history): entries cannot be edited, only the parent record. This keeps balances consistent.
5. **Service jobs**: final amount must be >= advance; delivery payment must be <= balance; refund must be <= advance (the legacy code only guarded the last one).
6. **No negative stock.** The legacy sale did not check stock; this app rejects a sale larger than the stock of a stocked item.
7. **Sale price** defaults to quantity x rate and can be edited (discounts), as in the legacy `pricefixer`.
8. **Admin.** The hardcoded `admin@srgpl.com` login is gone. The first account on a device becomes the *owner* and approves or rejects later registrations.
9. **Passwords** are salted PBKDF2 hashes. (The legacy app stored plain text.)
10. IDs are UUIDs, not the shared 1001+ counter. Displayed item/network/UPI "ID" numbers are per-user sequence codes.

## Testing report (what was actually run)

Run on Windows, Node 26, on the final code:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | passes, 0 errors |
| `npx vitest run` | 3 files, **34 tests passed** (auth/throttle/approval, stock/sale/return rules, purchase & credit ledgers, service state machine, recharge commission, daily sales, overview total, backup export/validate/import incl. id-collision refusal) |
| `npm run build` | succeeds; `dist/sw.js`, `dist/manifest.webmanifest` and 49 precached files generated |
| Manual browser check of `vite preview` build | first-run registration screen shown; account created; login; **all 18 routes render with no console errors or warnings**; added a stock item, recorded a 2-unit sale (price defaulted to 300, stock fell 10 -> 8), Daily Overview and Dashboard showed 300; service worker registered and active; **reload while offline** served the app and data; no horizontal overflow at 390 px width |

**Not tested** (be aware before relying on it):

- Backup download and restore through the browser UI (the logic is unit-tested; the file picker flow was not exercised).
- The "update available" prompt, the install prompt, and the persistent-storage grant (these depend on browser behaviour).
- Multi-user approval flow in the browser (unit-tested only), reset-password and delete-account in the browser.
- CRUD of every page individually (only sales/stocks/overview/dashboard were exercised by hand; the rest were opened and rendered).
- Browsers other than the one used here, iOS Safari, real phones, accessibility audit, Lighthouse, and an actual Netlify deploy.
- Large data volumes.

## Deploy to Netlify

`netlify.toml` already sets the build command (`npm run build`), publish directory (`dist`), the SPA redirect (`/* -> /index.html`, status 200), security headers (CSP, etc.), no-cache for `sw.js` and the manifest, and long-lived caching for `/assets/*`.

Option A, Git: push this folder to GitHub/GitLab, then in Netlify choose **Add new site -> Import an existing project**, select the repo, keep the detected settings (build `npm run build`, publish `dist`), and deploy.

Option B, manual: run `npm run build`, then drag the `dist` folder onto Netlify's **Deploy manually** page (or `npx netlify deploy --prod --dir=dist` with the Netlify CLI).

Notes: Netlify serves HTTPS, which service workers and installation require. Each deployed URL (including deploy previews and a custom domain) is a separate origin with its **own separate local database**; pick one production URL and keep using it. Do not commit `node_modules` or `dist`.

## Link it from the GoatManure.com admin dashboard

The app is a standalone site, so integration is a hyperlink only. In the admin dashboard template add, for example:

```html
<a href="https://YOUR-SITE.netlify.app/" target="_blank" rel="noopener noreferrer" class="btn">
  Open SRGPL Business Manager
</a>
```

Replace the URL with your Netlify (or custom-domain) address. No credentials or data are shared with GoatManure.com: the app has its
own local accounts and keeps data on each device. If you want users to land on a specific page, link to a route such as `/sales` (the
SPA redirect handles it). If GoatManure.com sends strict `X-Frame-Options`/CSP headers this does not matter for a normal link; embedding the app in an iframe is not supported (the CSP sets `frame-ancestors`).

## Features that were not migrated or changed

- Existing MySQL data is **not** imported. Enter data fresh or build a one-off converter if you need history.
- Admin hardcoded login, and e-mail features (`regmail.html`, `sendmail.js`, notification mails) were dropped: there is no server to send mail.
- jQuery / DataTables UI was replaced by native tables, search boxes and date filters.
- Editing of ledger entries (see rule 4), the `zero.php` reset (rule 3) and the shared ID counter (rule 10) changed as described above.
- Original Excel-like printing/export pages: replaced by CSV export.

## Open questions for the business owner

Please confirm so the rules can be adjusted if needed:

1. Overview: is the single formula above (including *minus* bank commission) the intended one?
2. Commission report: sum per network over the range, correct? (legacy showed the last row only)
3. Daily Transactions: should tomorrow's opening default to today's closing?
4. Service jobs: should a final amount lower than the advance, or a delivery payment above the balance, be allowed (e.g. to record an overpayment)?
5. Should "Other" network recharges count towards commission?
6. Should staff accounts see the same data as the owner, or only their own (currently each account is fully separate)?
