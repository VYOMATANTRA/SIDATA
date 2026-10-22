# SIDATA: Sistem Informasi Data Terpadu Kelurahan — SPEC

Domain/product specification for **SIDATA** — what the system is and does.
For setup, dev conventions, and codebase architecture, see [`AGENTS.md`](../AGENTS.md) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md) instead.

Status: draft. Captures decisions resolved so far. Actual data values (population figures,
area, etc.) live in the CMS and verified source publications, not in this document — this document
describes structure and rules, not content. The source index, evidence references, and factual-copy
rules are in [`CONTENT_SOURCES.md`](CONTENT_SOURCES.md); source files are maintained in the Google
Drive folder [Descan Manggar 2026](https://drive.google.com/drive/search?q=Descan%20Manggar%202026).

## 1. Purpose & Scope

SIDATA is a public profile / information portal for Kelurahan Manggar,
Balikpapan. It is:

- **Not** the BPS "Desa Cinta Statistik (Desa Cantik)" program itself — the site is one output
  tied to that program, branded separately.
- **Not** a civil-administration system — no citizen-service transactions, no internal workflow
  tooling. Profile/info only.
- **Not** a PPID document host. The footer's "Permintaan Data" page explains the PPID request
  procedure for data not published on the site and links to the official PPID website/forms. It
  never hosts PPID documents or labels Kelurahan public-setting contacts as PPID channels.

Frontend markup must use semantic HTML and target WCAG 2.1 Level A conformance — see
[`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md) for the rules this implies.

Related but distinct artifacts that feed into the site's content:

- **Eco Boba training booklet** — documents plastic-packaging waste converted into cushion filling.
  Reuse its verified facts (not its full text) in the site's Persampahan & Bank Sampah Unit page.
- **Manggar Dalam Angka 2026** — print/PDF publication containing primarily 2025 statistics, with
  metadata specifying 2024–2025 data and 2025/2026 field collection. It shares provenance with the
  site but is structured independently.
- **Monografi Kelurahan Manggar 2026** — includes population and active-BSU profiles; one edition
  documents participatory field data collection and technical assistance.
- **Peta Ketua RT dan BSU Aktif Manggar** — map publication whose source note credits VYOMATANTRA's
  July 2026 field survey for RT/BSU locations.
- **Proposal Inovasi Sosial_Desa Cantik Kelurahan Manggar** — its Lampiran 2 is the source for the
  eight-student proposal roster and assigned role labels on the VYOMATANTRA page. Group fieldwork
  is attributed to the team as a whole, not assigned to specific students without evidence.

Public website facts must be checked against their cited source and period in
[`CONTENT_SOURCES.md`](CONTENT_SOURCES.md). Do not infer that a document's publication year is its
data year, present potential benefits as measured outcomes, or expose employee identifiers and
personal contact details from source files.

## 2. Content Model

`Page` → `Chapter` → `Section`. A page is a topic group; a chapter is a subsection within it; a
chapter may contain one or more sections (no 1:1 constraint between chapter and section).

Resolved pages:

| #   | Page                           | Chapters                                                                                                                                                                                              |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kependudukan                   | Jumlah Penduduk, Jumlah Keluarga, + demographic chapters from the Potensi form (age pyramid, ethnicity across 17 groups, religion×sex, occupation)                                                    |
| 2   | Pendidikan                     | Tingkat Pendidikan, Wajib Belajar 9 Tahun, Rasio Guru-Murid, Kelembagaan Pendidikan                                                                                                                   |
| 3   | Kesehatan                      | Ibu Hamil, Bayi, Persalinan, Cakupan Imunisasi, PUS & KB, Air Bersih, PHBS, Gizi Balita, Jumlah Penderita Sakit, Sarana Kesehatan                                                                     |
| 4   | Ekonomi dan Ketertiban         | Pengangguran, Kesejahteraan Keluarga, Aset Sarana Produksi, Keamanan                                                                                                                                  |
| 5   | Geografis dan Tata Ruang       | Geography → Land Use → Resources (narrative arc, own spatial design track)                                                                                                                            |
| 6   | Pemerintahan & Kelembagaan     | 2.1 Wilayah Administrasi, 2.2 Aparatur Pemerintahan, 2.3 Pemerintahan Kelurahan, 2.4 Lembaga Kemasyarakatan, 2.5 Pertanggungjawaban dan Pembinaan; also hosts Sosial Kemasyarakatan (source doc §4.5) |
| 7   | Infrastruktur & Perumahan      | 6.1 Air Bersih dan Sanitasi, 6.2 Perumahan                                                                                                                                                            |
| 8   | Persampahan & Bank Sampah Unit | Eco Boba leaflet content, cites figures from Ekonomi & Ketertiban / Geografis pages rather than standalone metrics, ends with a pointer to the full Eco Boba booklet                                  |

Notes:

- Kesehatan excludes Wabah Penyakit and Angka Harapan Hidup — unavailable in Prodeskel.
- Budget/finance content is dropped entirely — see §9.
- Ketua RT is presented as a single table (100 rows, one per RT), not one page per RT — see
  `rt_leaders` in §7 for the schema and §8 for where it lives.
- Widget Cuaca is not editorial content (no CRUD, not passed through editor/admin, directly from BMKG's public API).
- Chapters are seeded (`backend/prisma/ceritaPages.ts`) from the table above; sections are not —
  they are created with the content that attaches to them. Two choices go beyond what the table
  states: Sosial Kemasyarakatan is the last, unnumbered chapter of Pemerintahan & Kelembagaan, and Persampahan &
  Bank Sampah Unit starts with Bank Sampah Unit, Program Eco Boba and Booklet Eco Boba chapters.
  Seeding never overwrites titles or ordering an editor has since changed.
- The Ketua RT roster the repository ships is **synthetic only** (`backend/prisma/rtLeadersData.ts`):
  placeholder names, placeholder phone numbers, and generated coordinates. Real Ketua RT names, phone
  numbers, and home locations are personal data and must never be committed. The operational roster is
  loaded from a non-committed source or an admin import at deploy time — see §10 for the open
  import-path question.
- Every RT-leader seed upsert carries `update: {}`. Re-running the seed fills in rows that are
  missing and nothing else; it must never revert a correction an editor has already made.
- `GET /api/pages` and `GET /api/pages/:slug` expose the hierarchy publicly (page → chapters →
  sections, each ordered by `sort_order`).
- `POST /api/pages`, `DELETE /api/pages/:slug`, and `PUT /api/pages/reorder` manage the Cerita page list
  (restricted to Editor and Admin roles, audited via `audit_logs`). Reordering updates page `sort_order`
  values in a single atomic database transaction with deterministic lock ordering to prevent deadlocks.

## 3. Roles

| Role   | Can do                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor | Edit data figures and prose; choose which comparison template an indicator uses (§5); manage the Cerita page list (add/remove/reorder pages); edit Sambutan Lurah |
| Admin  | Everything Editor can, plus user/role management and authoring new phrase-structure templates for the computed-comparison prose builder (§5) |

No third role (e.g. viewer/approver) is defined. No periodic-review role exists — see §6.

### Authentication & Account Verification Rules

- **Local Registration & Email OTP**: Registration with email/password sets `email_verified = false` initially. A 6-digit numeric OTP (15-minute TTL, maximum 5 failed attempts) is dispatched to the user's email. Account requires OTP verification before local login access is granted. Successful OTP verification sets `email_verified = true` and auto-logs in the user. Local accounts that already existed before OTP verification was introduced are grandfathered in as verified (backfilled at the migration that added the column) rather than retroactively locked out — they never had OTP verification to go through. Hitting the 5-attempt cap does not discard the OTP record — it stays in place so the resend cooldown below still applies to it; only a genuinely expired OTP is deleted outright.
- **OTP Resend Cooldown**: Requesting a new OTP is throttled to one request per 60 seconds per account, enforced against the existing OTP record's creation time (not a separate counter) — which is why the record survives attempt-lockout rather than being deleted.
- **Google OAuth2**: Authentication via Google uses the OAuth 2.0 Authorization Code + PKCE (S256) flow. Users created via Google OAuth have `email_verified = true` automatically. If a verified Google account matches an existing local user's email, the account is automatically linked (`auth_provider = 'google'`, `provider_id = sub`), clears any pending first-login password change flag (`requires_password_change = false`), clears `password_hash = null`, and that account's outstanding refresh tokens are revoked, so a session obtained under the old local password stops working once the account moves to Google-only auth. Session tokens are issued via `httpOnly` refresh cookies without passing tokens in URL query strings.
- **Anti-Bot Protection**: Mutating authentication endpoints (registration, login, OTP verification, OTP resend, first-login password setup) enforce Cloudflare Turnstile verification.
- **Admin User Management & Soft Deletion**: Only Admins can manage users and roles. Account deletion is performed via soft deletion (`deletedAt`). Deactivated accounts remain visible in the Admin User Management table with their status displayed. Soft-deleting an account immediately revokes all active refresh tokens for that user and blocks active JWT access tokens via real-time DB verification. Admins cannot deactivate, change the password of, or demote their own account or peer Admin accounts via the User Management endpoints (self-service password changes must go through the `/api/profile/change-password` endpoint). Public registration using a soft-deleted email returns a distinct notification (`409 Conflict`) instructing the user to contact an Administrator, while creating an account in User Management with an email belonging to a soft-deleted account returns `409 Conflict` directing the Administrator to use account reactivation instead. User management API rate limiting separates read operations (`GET /api/users`, `GET /api/users/roles` at 300 req/15min) from mutating actions (`POST`, `PATCH`, `DELETE` at 100 req/15min) to prevent high-frequency administrative workflows and NAT-shared IP environments from tripping false-positive rate limit locks.
- **Account Reactivation & Forced Password Change**: Admins can reactivate soft-deleted accounts directly via the dedicated reactivation toggle in the User Management table, confirmed via a modal popup. Accounts created or having their password reset by an Admin are trusted (`email_verified = true`), enforce NIST password guidelines (8–128 characters, zxcvbn strength >= 2), revoke all outstanding sessions immediately, and are flagged with `requires_password_change = true`. Upon logging in with an admin-assigned password, users receive a restricted setup token and must complete the Cloudflare Turnstile-protected password setup flow (`/setup-password`) before gaining access to standard protected routes. Setting a new password via the first-login setup flow is restricted strictly to local accounts (`auth_provider = 'local'`).
- **Cerita Page Management Rules**: Editors and Admins manage the Cerita page list via `POST /api/pages`, `DELETE /api/pages/:slug`, and `PUT /api/pages/reorder`.
  - Adding a page (`POST /api/pages`) rejects HTML markup in titles, validates slugs as kebab-case (max 100 characters, protected against reserved keywords), and auto-defaults `sort_order = max + 1` if omitted.
  - Deleting a page (`DELETE /api/pages/:slug`) cascades empty chapters/sections, blocks deletion if attached `content_blocks` exist, and records a `warning` audit log.
  - Reordering pages (`PUT /api/pages/reorder`) is atomic and validates against concurrent changes; a no-op reorder is not audited or written to the database.
  - Rate limiting for mutating page actions is per-user (100 req/15min).

### Audit Trail

Every admin user-management action (create, reactivate, role change, password reset, deactivate),
every page list mutation (page creation, deletion, reordering),
and every security-relevant auth event (login success/failure, logout, first-login password set,
Google account linking, session revocation, OAuth state mismatch, refresh-token mismatch, OTP
verification/lockout) is recorded in `audit_logs` (§7). Read access is admin-only
(`GET /api/audit-logs`, `/summary`); there is no editor-facing or public view. `audit_logs` is
also where the tier-1 prose-builder override log (§5) lives (`comparison_template.keyword_warning_overridden`), rather
than a second table — `target_type`/`target_id` are unconstrained (no FK) specifically so future
content tables (indicators, prose, RT leaders, etc.) can be audited without a schema change.

- **Severity is fixed per action, not chosen per call site** — `info` / `warning` / `critical`,
  defined once in `backend/src/services/audit.service.ts`'s `AUDIT_ACTIONS` table. `critical`
  covers privilege-affecting or credential-affecting events (role changes, admin password
  resets, Google account linking, OAuth/refresh-token integrity failures, OTP lockout, and
  retention-policy changes themselves). A `critical` row stays open (`acknowledgedAt = null`)
  until an admin explicitly acknowledges it (`PATCH /api/audit-logs/:id/acknowledge`); an
  unacknowledged `critical` row is never pruned, regardless of age.
- **Never logged**: password hashes, plaintext passwords, JWTs/refresh tokens, OTP codes. A
  password-change event records only that a change happened, not any credential material.
- **Write semantics**: an audit row is written in the same DB transaction as the mutation it
  records wherever one already exists (admin user-management actions); standalone auth events
  are wrapped in a dedicated single-row transaction. A failed audit write is not silently
  swallowed — it surfaces as a failed request, by design, rather than risk a mutation with no
  corresponding log entry.
- **Tamper defense is two layers**: an application-level guard (a Prisma client extension)
  blocks any write to an existing `audit_logs` row other than the two acknowledge columns; the
  actual enforcement is column-level MySQL grants on the app's runtime DB user — no `DELETE`,
  `UPDATE` restricted to the acknowledge columns — applied via a checked-in, manually-run script
  (`backend/scripts/grants/audit-logs-grants.sql`), separate from Prisma migrations.
- **Retention is admin-configurable per severity** (`GET`/`PATCH /api/settings/audit-retention`,
  values in whole days, `0` = keep forever), defaulting to keep-forever on a fresh install so
  nothing is silently deleted until an admin opts in. `critical` retention must be >= `warning`
  >= `info` (treating `0` as infinite) — a more severe event may not be discarded before a less
  severe one. Changing retention is itself logged at `critical` severity with before/after
  values, since shortening it is the single most useful move for covering one's tracks. Pruning
  executes outside the running app, via a separate privileged DB connection
  (`backend/scripts/prune-audit-logs.ts`), never through the app's own (deliberately
  DELETE-incapable) runtime user.

## 4. Data Entry

Hybrid model:

- **Scalar indicator figures** — manual, form-based entry. Bulk XLS import is deferred and out
  of current scope; it depends on a Prodeskel XLS export that has not been confirmed to exist.
  If such an export is confirmed later, import would layer on top of manual entry, not replace
  it.
- **Matrix/table-shaped data** (age pyramid, 17-group ethnicity, religion×sex, occupation table —
  4 fixed-shape tables) — manual, form-based entry only. Bulk import is explicitly out of scope
  for these.
- **Prose** — field-by-field forms (tier-1 builder or tier-2 free text; see §5).

## 5. Prose Rules

Two tiers, by design intent:

**Tier 1 — computed comparison.** Applies only to indicators with a genuinely paired
tahun-ini/tahun-lalu value (`value_previous` not null — see §7). Confirmed scope so far:
Jumlah Penduduk and Jumlah Keluarga on the Kependudukan page. Editor chooses a pre-approved
sentence template for the indicator; the system fills it from the paired fields — no free-text
claim authoring at Editor level. This is rendered, not human-authored, comparison language, and it
is rendered at read time (never stored), so it cannot disagree with the figures beside it.

- **Template shape.** One `body` with exactly one `{trend}` slot, plus three variants (`naik`,
  `turun`, `tetap`) that fill that slot. Allowed slots: `{label}`, `{unit}`, `{value_current}`,
  `{value_previous}`, `{period_current}`, `{period_previous}`, `{delta}`, `{delta_percent}`,
  `{trend}`; `{trend}` is body-only. Placeholder names are exact (`{Trend}` is unknown); an unknown
  or malformed placeholder, a missing or repeated `{trend}`, or `{trend}` inside a variant is rejected.
- **Computed, not chosen.** The direction comes from an exact decimal comparison of
  `value_current` and `value_previous`. Numbers render id-ID style (`12.480`, `0,97`); `{delta}` is
  the absolute difference and `{delta_percent}` its share of `|value_previous|`, rounded half-up to
  two places. When the text needs a percentage of a zero base, no comparison is rendered.
- **Attaching.** An indicator may reference a template only if it is flagged
  `is_computed_comparison` and has both `value_previous` and `period_previous` (otherwise 400,
  backed by a database `CHECK`). A request cannot clear that pair or the flag while a template is
  attached unless it detaches the template in the same request.

Admin can author new sentence structures without a code deploy. Any new structure containing a
trend/comparison claim must place it in a proper conditional slot; a keyword check scans for
trend/superlative language (_meningkat, menurun, tertinggi, terendah_, etc.) appearing **outside**
that slot. The word list lives in code, not in the CMS, and only the `body` is scanned (the
variants are the conditional slot). Enforcement is **warn-on-save**, not a hard block — the
warning restates the specific flagged phrase and its consequence and requires acknowledgment tied
to that exact wording (not a generic dismiss): the save is refused with `422
TREND_KEYWORD_ACK_REQUIRED` listing each flagged occurrence with an `ackKey` bound to the exact
body and position, and only a request that echoes those keys back in `acknowledgedWarnings` is
saved, so changing the wording needs a fresh acknowledgment. Overrides are logged
(`comparison_template.keyword_warning_overridden`, §3) for after-the-fact tracing only, not
proactive catching — see §6 for why.

**Tier 2 — general narrative** (page prose, Sambutan Lurah). Free text, house-style-guided, no
system enforcement.

## 6. Staleness & Narrative-Sync Policy

There is no live drift-detection, periodic-review, or claim-level tagging mechanism, by design —
none is staffable post-handoff.

Instead, safety is built into what prose is _allowed to claim at write-time_:

1. Fields with a genuine tahun-ini/tahun-lalu pairing → tier-1 computed comparison (§5).
2. Everything else → point-in-time, hedged framing only. No trend or superlative language tied to
   a moment (avoid "terus meningkat," "tertinggi di kecamatan"). Figures are framed as period
   snapshots ("Berdasarkan data [tahun/periode]..."). This applies especially to the June 2024
   Potensi fields (age pyramid, ethnicity, religion×sex, occupation), which have no tahun-lalu
   pairing at all.

## 7. Database Schema (content data)

10 tables. Scope is content data only — CMS/admin tables (roles, prose-builder templates,
override logs) are a separate concern and not covered by this pass. (The existing `Role`, `User`,
`RefreshToken`, and `EmailOtp` tables in `schema.prisma` are the auth layer, already implemented, and distinct
from the tables below.)

This section expresses design intent in raw-DDL vocabulary (`ENUM`, `CHECK`, snake_case table
names). All 10 tables are implemented in `backend/prisma/schema.prisma`: `spatial_points`,
`spatial_point_rt`, `rt_leaders` (migration `20260819000000_add_spatial_and_rt_tables`),
`content_blocks` (migration `20260917103839_add_content_blocks`), `pages`, `chapters`, `sections`
(migration `20261009000000_add_content_hierarchy`), `indicators` in migration
`20261010011827_add_indicators`, and `indicator_tables`, `indicator_table_rows` in migration
`20261010120000_add_indicator_tables`. Translate into Prisma models with `@@map` when
implementing.

| Table                                       | Purpose / key design notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`, `chapters`, `sections`             | Hierarchy per §2. No 1:1 constraint between chapter and section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `indicators`                                | Scalar figures. `value_current` / `value_previous` (nullable — null `value_previous` mechanically gates the tier-1 prose builder), `period_current` / `period_previous`, `is_computed_comparison`, `is_stale` (flags June 2024 Potensi fields), `source`, `hedge_note`. `section_id` required FK to `sections.id` (`ON DELETE RESTRICT` — a section holding indicators cannot be deleted until they are removed through the audited API, consistent with `content_blocks`). Read via public `GET /api/indicators` and `GET /api/indicators/:id`; the by-id route resolves an ID first, then falls back to a case-insensitive slug match. Mutated via editor/admin-only `POST` / `PATCH /:id` / `DELETE /:id` (CSRF-protected, logged in `audit_logs` as `indicator.created` / `indicator.updated` / `indicator.deleted`). `comparison_template_id` nullable FK to `comparison_templates` (§5 tier-1; the read DTO carries the rendered `comparison`).                                                                                                                                                                                                                                                                                                                                                                                                          |
| `indicator_tables` + `indicator_table_rows` | Normalized rows (not a JSON blob) for the 4 fixed-shape matrix tables — cells need to be queryable/computable. Manual entry only (§4). Wide-row shape: one row per logical group with nullable `INT` cells — `male`/`female` for the sex-split kinds (`age_pyramid`, `religion_by_sex`), `total` for the single-value kinds (`ethnicity`, `occupation`); enforced per-kind in the service. `total` for sex-split rows is derived on read (`male + female`), never stored alongside them, so the two cannot drift. Single `period` (June 2024 Potensi point-in-time snapshots, no tahun-lalu pairing — §6). `section_id` required FK to `sections.id` (`ON DELETE RESTRICT`, consistent with `indicators`/`content_blocks`); rows cascade with their table; `UNIQUE (table_id, row_key)`. Read via public `GET /api/indicator-tables` (filterable by `sectionId`/`kind`) and `GET /api/indicator-tables/:key` (slug-or-id, returns rows + SQL-`SUM` totals, in-memory cached); mutated via editor/admin-only `POST /` (optional nested `rows` in one transaction), `PATCH /:id` / `DELETE /:id`, `POST /:id/rows`, `PATCH /rows/:rowId` / `DELETE /rows/:rowId` (CSRF-protected, logged in `audit_logs` as `indicator_table.created` / `indicator_table.updated` / `indicator_table.deleted` and `indicator_table_row.created` / `indicator_table_row.updated` / `indicator_table_row.deleted`). |
| `spatial_points`                            | Ketua RT and Bank Sampah unit point records (~100, manual field survey). `type` ENUM, lat/lng, `metadata` JSON (MySQL has no JSONB). Feeds the interactive map, which is also an entry point to the Ketua RT page (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `spatial_point_rt`                          | Junction table (`point_id`, `rt_number`). Needed because Ketua RT points are always 1:1 with an RT, but a Bank Sampah unit can cover multiple RTs (e.g. one unit serving RT 30/72/60) — a flat `rt_number` column on `spatial_points` would be lossy. **Enforcement notes**: (1) The 1:1 invariant for `ketua_rt` points cannot be enforced with a partial unique index (`UNIQUE (point_id) WHERE type = 'ketua_rt'`) because MySQL does not support partial unique indexes. The write path (when a spatial-point write endpoint is added) must validate that a `ketua_rt` point references exactly one RT before committing. The read path (`maps.service.ts`) detects violations at query time via one shared resolution rule applied on both sides of the join: an RT resolves to a `ketua_rt` point only if exactly one `ketua_rt` point covers it **and** that point covers exactly one RT. On the points side (`GET /api/maps/points`, `/points/:id`) a violation sets `rtLeader` to `null`; on the leaders side (`GET /api/maps/rt-leaders`, `/rt-leaders/:rtNumber`) it sets `coordinates` to `null`. In both cases an `integrityWarning` field describes the anomaly (multiple `ketua_rt` points on one RT, a `ketua_rt` point spanning several RTs, or an RT coverage referencing an RT with no matching `rt_leaders` row), and the anomaly is logged server-side. `GET /api/maps/summary` applies the same rule: conflicted RTs are excluded from `rtLeadersWithCoordinates` (so they fall into `rtLeadersWithoutCoordinates`) and are additionally reported via `rtLeadersWithIntegrityConflicts`, so a data problem is visible from the summary endpoint without cross-referencing the points list. (2) The FK from `rt_number` → `rt_leaders.rt_number` was intentionally dropped (migration `20260820000000`) because Prisma 7 requires a declared back-relation on both sides of a `@relation`, and adding `spatialPointRts SpatialPointRt[]` to the `RtLeader` model has no semantic meaning in this domain — the coordinate join is an asymmetric, query-time filtered read. In place of the FK, migration `20260826000000` adds `CHECK (rt_number BETWEEN 1 AND 100)` to enforce the valid RT range at the DB layer. Manggar has 100 RTs; if this changes, update the `BETWEEN` bounds in that migration and here. |
| `content_blocks`                            | Prose/narrative content. `section_id` nullable FK to `sections.id` (`ON DELETE RESTRICT` — a section that still has blocks cannot be deleted, since MySQL forbids `SET NULL`/`CASCADE` on a column used in the `CHECK` below; populated for normal Cerita/stat-page prose tied to the hierarchy; null for standalone blocks like hero, Sambutan Lurah, landing highlights). `block_type` ENUM (`hero`, `sambutan_lurah`, `highlight`, `prose`), `slug` (stable lookup key), `body` TEXT (tier-2 free text). `sort_order INT NULL` with `CHECK (section_id IS NOT NULL OR sort_order IS NULL)` — ordering only means something within a section; standalone blocks are unique named slots with no siblings to sort against. Read via public `GET /api/content-blocks` and `GET /api/content-blocks/:slug` (in-memory cached); mutated via `PATCH /api/content-blocks/:slug` (Editor or Admin only, CSRF-protected, logged in `audit_logs` as `content_block.updated`). |
| `rt_leaders`                                | Single table, 100 rows (one per RT — not per-RT pages). `rt_number`, `name`, `phone`, `phone_is_whatsapp BOOLEAN` (some numbers aren't WhatsApp-registered — determines tap-to-chat vs. call-only rendering), `alamat` nullable (some addresses genuinely missing). No lat/lng column — coordinates are reached by joining `rt_leaders.rt_number` → `spatial_point_rt.rt_number` → `spatial_points.id`, filtered on `spatial_points.type` (required, not optional: a Bank Sampah unit covering RT 30/72/60 means `rt_number` is not unique in `spatial_point_rt`, so an unfiltered join also returns Bank Sampah points). Avoids duplicating/drifting lat-lng across two tables. |

No indicator-citation-tracking table exists. Cerita-page data citations (e.g. the Bank Sampah
page citing Ekonomi & Ketertiban figures) stay informal/manual in prose text, not structurally
linked.

`allowPublicKeyRetrieval` is off unless a deployment opts in with `?allowPublicKeyRetrieval=true`
in the connection string. Fetching the MySQL RSA public key over an unverified channel hands the
key to whoever is in the middle, and with it the database password. The two database clients
therefore differ:

- The **app client** (`DATABASE_URL`) opts in through the query parameter, and only through it —
  `allowPublicKeyRetrievalFrom` returns true only for `?allowPublicKeyRetrieval=true`.
- The **privileged audit-pruning client** (`AUDIT_ADMIN_DATABASE_URL`, `backend/scripts/prune-audit-logs.ts`)
  never opts in. It hardcodes `allowPublicKeyRetrieval: false`, and the flag in
  `AUDIT_ADMIN_DATABASE_URL` is ignored, because this client carries the admin password and a
  query parameter must not be able to turn the safeguard off for it.

Three more tables exist alongside the auth layer (`Role`, `User`, `RefreshToken`, `EmailOtp`),
implemented and out of scope for this schema pass in the same way those are:

- `audit_logs` — the audit trail (§3). `target_type`/`target_id` are deliberately not a foreign
  key, so it can log actions against any of the 10 content tables above once they exist, without
  a schema change. This is also where the §5 tier-1 prose-builder override log lives.
- `system_settings` — generic key/value store. Stores admin-configurable audit log
  retention (`audit.retention_*`, §3), public portal profile/contact metadata (`public.*`
  covering app name, institution, tagline, administrative area, phone, WhatsApp, email, address,
  default map coordinates, and BMKG adm4 area code), and operational weather tuning knobs
  (`weather.bmkg_base_url`, `weather.cache_ttl_ms`, `weather.stale_retry_ms`, `weather.fetch_timeout_ms`).
  The `value` column is `TEXT` (migration `20260917170000_expand_system_setting_value_to_text`)
  to support structured JSON and longer copy. Public settings are read via `GET /api/settings/public`
  (unauthenticated, cached in-memory with invalidation, whitelist-filtered) and mutated by Admins via
  `PATCH /api/settings/public` (audited as `settings.public_updated`). Operational weather settings are
  managed by Admins via `GET` and `PATCH /api/settings/weather-config` (cached in-memory, audited as
  `settings.weather_updated`), allowing runtime tuning of BMKG endpoint, cache TTL, and retry backoffs
  without code redeployment.

- `comparison_templates` — the admin-authored sentence templates of the §5 tier-1 builder
  (migration `20261010123453_add_comparison_templates`): `slug` (unique), `label`, `body` TEXT with
  exactly one `{trend}` slot, and `trend_naik` / `trend_turun` / `trend_tetap` TEXT variants.
  `indicators.comparison_template_id` references it with `ON DELETE RESTRICT` / `ON UPDATE
  RESTRICT` (MySQL forbids CASCADE/SET NULL on a column used in a `CHECK`), so a template that
  indicators use cannot be deleted (409), and `CHECK (comparison_template_id IS NULL OR
  (is_computed_comparison AND value_previous IS NOT NULL AND period_previous IS NOT NULL))`
  enforces the §5 attach rule in the database. Read via `GET /api/comparison-templates` and
  `/:id` (Editor or Admin — templates are not public content, only the rendered sentence is);
  mutated via Admin-only `POST` / `PATCH /:id` / `DELETE /:id` (CSRF-protected, logged as
  `comparison_template.created` / `.updated` / `.deleted`, plus the override action in §3).
  Seeded with a default `perbandingan-tahunan` template.

Weather widget data (§8) has no table here, and isn't merely uncovered by this pass — it's
out of scope for this schema entirely. It's fetched live from BMKG's public API and cached
in-memory by the backend process, not persisted to MySQL. There's no editorial value being
authored or versioned, so nothing needs storing. Operational knobs governing its fetching and
caching live in `system_settings` as a separate operational concern.

## 8. Site Structure

**Landing page**, top to bottom:

1. Hero — institutional voice: what the site is and what it covers. Framed toward Manggar's general "potensi wilayah," not an explicit Bank Sampah callout even though the main potential is Bank Sampah.
2. Sambutan Lurah — kept as a separate section, personal/welcoming voice, distinct from the
   hero's institutional voice.
3. Cerita preview — cards for the stat pages, each showing a few representative figures + link.
   Data-caveat/provenance handling is deferred to the full stat pages, not shown on the cards.
4. Publikasi / Peta highlights — includes the interactive map.
5. Widget Cuaca — Weather conditions in Manggar: description, temperature Celsius, humidity percent, wind speed (kmh), wind direction

SOTK and "who is the lurah" content is **not** on the landing page — it lives on the existing
"Tentang Kelurahan Manggar" page instead.

**Ketua RT page.** The `rt_leaders` table (§2, §7) gets its own dedicated page, treated as a
publication-class artifact — a peer of Publikasi and Peta, not a subsection of either. It is one
of the site's highest-utility artifacts (a resident looking up their own RT head), so it is not
buried inside a stat page. Entry points:

- Footer, under **Sumber Daya**.
- The interactive map — tapping an RT point opens that leader's contact card.
- Pemerintahan & Kelembagaan, chapter 2.3 (Pemerintahan Kelurahan), **links to** this page rather
  than duplicating the table, so the 100 rows have exactly one home.

The page provides **in-table search**: a single labelled text input filtering on both
`rt_number` and leader `name`, applied client-side over the full 100-row set (no server
round-trip). The matching rows are then **paginated client-side**, with a page-size control
(10/25/50/100 rows) and a bounded page-number list, so paging never costs a second request —
the page already asks for all 100 leaders in one call. The visible row count is announced as
results change ("Menampilkan N dari 100 RT"; a paginated slice is announced as
"Menampilkan 1–10 dari 100 RT"). Rows remain sorted by `rt_number` and the unfiltered table is
the default state, so the page is fully usable with JavaScript-driven filtering ignored. No
RT-range grouping or collapsible bands — flat table only.

Accessibility implications, per `docs/ACCESSIBILITY.md`: the input needs a real `<label>` (not
placeholder-only), the result count belongs in an `aria-live="polite"` region, and the table
keeps proper `<caption>` / `<th scope>` semantics under filtering.

**Peta explorer.** The public map shows matching spatial points with zoom-based marker clustering;
clusters expand as visitors zoom, and overlapping points remain individually selectable at close
zoom. A coordinated results panel contains one search for point names, RT numbers, and available RT
leader names, category filters, nearest-first results, and five-result pagination. Pagination only
changes the list; all filtered points remain on the map. Selecting a result focuses its marker and
shows its details in the same panel. Search and filters reset the result list to page one. The list
remains a keyboard-accessible alternative to interacting with the map.

**Footer:**

- **Sumber Daya** — Publikasi (Prodeskel publications, infographics, Eco Boba booklet, etc.), Peta
  (interactive, QGIS-derived), Permintaan Data (PPID external pointer with request steps), Ketua RT.
- **Cerita** — links to the Cerita-labeled pages. Confirmed: the 7 stat pages + Persampahan & Bank
  Sampah Unit.
- **Tentang** — Kelurahan Manggar, Program Desa/Kelurahan Cantik, Inovasi Sosial VYOMATANTRA.
- **Kolaborasi** — three logos: Desa Cantik/BPS, ITK, Tim Insos VYOMATANTRA.

**Page inventory.** Three classes; this is the full set of public pages. Current frontend routes are listed below.

| Class       | Pages                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Cerita      | The 8 pages in §2                                                            |
| Sumber Daya | Publikasi, Peta, Permintaan Data, Ketua RT                                   |
| Tentang     | Kelurahan Manggar, Program Desa/Kelurahan Cantik, Inovasi Sosial VYOMATANTRA |

Plus the landing page itself.

Implemented frontend routes:

| Page                          | Route                        |
| ----------------------------- | ---------------------------- |
| Tentang Kelurahan Manggar     | `/tentang/kelurahan-manggar` |
| Program Desa/Kelurahan Cantik | `/tentang/desa-cantik`       |
| Inovasi Sosial VYOMATANTRA    | `/tentang/vyomatantra`       |
| Permintaan Data               | `/permintaan-data`           |

`/tentang` redirects to `/tentang/kelurahan-manggar`.

The Kelurahan Manggar profile publishes **Kelurahan Karang Joang** only as its northern
administrative boundary, following the 2025 boundary table in `Manggar Dalam Angka 2026`
(Tabel 1.1.2; printed p. 18, PDF viewer p. 19).

The official-profile paragraphs (the Lurah section) describe intent and expected benefit in
neutral third-person narration, using "diharapkan" or "dapat membantu". They do not use first-person
"kami" phrasing and do not state that policies, outcomes, or economic improvements have already
happened.

The spatial map card uses the same description on both the Kelurahan Manggar and Desa Cantik
pages: "Peta lokasi rumah ketua RT dan bank sampah aktif di Kelurahan Manggar, Kecamatan Balikpapan
Timur." Complete coverage of all RT and BSU locations is not established, so the wording must not
claim it (no "seluruh").

The VYOMATANTRA page publishes the eight-student proposal roster and assigned role labels from
`Proposal Inovasi Sosial_Desa Cantik Kelurahan Manggar.docx`, Lampiran 2. The page attributes field
survey, spatial-data collection/compilation, and mapping to the team collectively, not to individual
members without supporting evidence.

The VYOMATANTRA page also publishes the program kerja as a four-part journey, following the
proposal's own stages: persiapan, pelaksanaan, monitoring dan evaluasi, and pelaporan dan tindak
lanjut, with the proposal's scheduled activities listed under each stage. The section presents the
program work as designed in the proposal and attributes it to that document, pointing to the
Monografi, the map, and the booklet for the field record.

## 9. Explicitly Out of Scope

- **Budget/finance (APBDes) surfacing** — dropped entirely; the kelurahan has no APBDes. Note that
  Tabel 2.5.2 of "Kelurahan Manggar Dalam Angka 2026" is not a substitute: it holds
  accountability/oversight counts (LKPJ submissions, kinerja reports, jumlah supervisi/diklat,
  jumlah kasus pengaduan), not budget content.
- **UMKM curation** — not included.
- **Guestbook** — excluded.
- **PPID document hosting** — never; external pointer only (§1).
- **Data-collection instrumentation** (RT sweep design, one-instrument-vs-one-occasion) — out of
  scope for this site. The site only consumes Prodeskel's already-published output; data
  collection is a Prodeskel-stage concern.
- **Civil-administration features** (the earlier-explored district-level admin system / VPS
  infrastructure work) — a separate, earlier workstream, not part of this site.
- **Bulk XLS import of scalar figures** — deferred, not dropped. Contingent on a confirmed
  Prodeskel XLS export; until then scalar figures are entered manually (§4). Matrix/table-shaped
  data is excluded from bulk import permanently, not just deferred.
- **WCAG Level AA/AAA conformance** — the target is Level A (§1). AA criteria such as color
  contrast (1.4.3) and visible focus indicators (2.4.7) are documented as SHOULD-level guidance in
  `docs/ACCESSIBILITY.md` rather than enforced, since no automated audit or CI gate exists yet to
  hold the higher bar.

## 10. Open Items

Single register — unresolved questions live here and nowhere else.

- **Source-version reconciliation (Google Drive: Descan Manggar 2026):** Confirm which of the two
  `Monografi Kelurahan Manggar 2026` editions is current/approved for public facts. The expanded
  edition has 14 BSU profiles; another edition has a different page count and content.
- **BSU RT identity:** The expanded Monografi's BSU identity list includes RT 46, while later
  profile sections refer to RT 64. Confirm the correct RT and update derived public data consistently.
- **Cross-publication data conflicts:** Reconcile any conflicting values between the 2025 profile,
  both Monografi editions, `Manggar Dalam Angka 2026`, and the Excel infographic workbook before
  publishing affected values. The local working copy of the Drive folder named `Tabel Perbandingan
  Konsistensi Data Pada Semua Media Publikasi` was empty; check Google Drive for an approved
  reconciliation before resolving this item.
- **SOTK names and duties:** Monografi Kelurahan Manggar lists several current office roles and
  names (PDF viewer pp. 8–9), but does not document the detailed duties previously shown on the
  profile page. Keep those duties unavailable until an approved SOTK or job-description source is
  supplied. When a name is absent from an approved source, render “Nama pejabat belum tersedia”; do
  not infer an appointment process.
- **Vision and mission statement:** No approved wording was found in the inspected source set. Keep
  this section omitted until the Kelurahan provides an approved vision/mission document.
- **Operational Ketua RT roster import:** The repository ships a synthetic roster only (§2). Decide
  and build the path that loads the real roster — a non-committed deploy-time file, or an
  editor/admin import — before the Ketua RT page carries real contacts. Until then the seeded rows
  are placeholders and the page must not be presented as the live directory.
- **Public visibility of Ketua RT contacts:** The page publishes names, phone numbers, and addresses
  for private individuals. Confirm with the kelurahan whether the directory is published as-is, or
  needs a reduced field set (for example address withheld, or contact only on request).
