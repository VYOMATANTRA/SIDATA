# SIDATA: Sistem Informasi Data Terpadu Kelurahan — SPEC

Domain/product specification for **SIDATA** — what the system is and does.
For setup, dev conventions, and codebase architecture, see [`AGENTS.md`](../AGENTS.md) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md) instead.

Status: draft. Captures decisions resolved so far. Actual data values (population figures,
area, etc.) live in the CMS / Prodeskel exports, not in this document — this document describes
structure and rules, not content.

## 1. Purpose & Scope

SIDATA is a public profile / information portal for Kelurahan Manggar,
Balikpapan. It is:

- **Not** the BPS "Desa Cinta Statistik (Desa Cantik)" program itself — the site is one output
  tied to that program, branded separately.
- **Not** a civil-administration system — no citizen-service transactions, no internal workflow
  tooling. Profile/info only.
- **Not** a PPID document host. The footer's "Permintaan Data" page is an external pointer only —
  it explains the PPID request procedure for data not published on the site; it never hosts PPID
  documents (e.g. no Transparansi Keuangan).

Frontend markup must use semantic HTML and target WCAG 2.1 Level A conformance — see
[`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md) for the rules this implies.

Related but distinct artifacts that feed into the site's content:

- **Eco Boba booklet** — full training-documentation artifact (separate publication). Its content
  is reused (not duplicated 1:1) into the site's Persampahan & Bank Sampah Unit page.
- **Manggar dalam Angka 2026** — print/PDF publication. Shares data provenance with the site, but
  is structured independently of it.

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

## 3. Roles

| Role   | Can do                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor | Edit data figures and prose; manage the Cerita page list (add/remove/reorder pages); edit Sambutan Lurah                                     |
| Admin  | Everything Editor can, plus user/role management and authoring new phrase-structure templates for the computed-comparison prose builder (§5) |

No third role (e.g. viewer/approver) is defined. No periodic-review role exists — see §6.

### Authentication & Account Verification Rules

- **Local Registration & Email OTP**: Registration with email/password sets `email_verified = false` initially. A 6-digit numeric OTP (15-minute TTL, maximum 5 failed attempts) is dispatched to the user's email. Account requires OTP verification before local login access is granted. Successful OTP verification sets `email_verified = true` and auto-logs in the user. Local accounts that already existed before OTP verification was introduced are grandfathered in as verified (backfilled at the migration that added the column) rather than retroactively locked out — they never had OTP verification to go through. Hitting the 5-attempt cap does not discard the OTP record — it stays in place so the resend cooldown below still applies to it; only a genuinely expired OTP is deleted outright.
- **OTP Resend Cooldown**: Requesting a new OTP is throttled to one request per 60 seconds per account, enforced against the existing OTP record's creation time (not a separate counter) — which is why the record survives attempt-lockout rather than being deleted.
- **Google OAuth2**: Authentication via Google uses the OAuth 2.0 Authorization Code + PKCE (S256) flow. Users created via Google OAuth have `email_verified = true` automatically. If a verified Google account matches an existing local user's email, the account is automatically linked (`auth_provider = 'google'`, `provider_id = sub`), clears any pending first-login password change flag (`requires_password_change = false`), clears `password_hash = null`, and that account's outstanding refresh tokens are revoked, so a session obtained under the old local password stops working once the account moves to Google-only auth. Session tokens are issued via `httpOnly` refresh cookies without passing tokens in URL query strings.
- **Anti-Bot Protection**: Mutating authentication endpoints (registration, login, OTP verification, OTP resend, first-login password setup) enforce Cloudflare Turnstile verification.
- **Admin User Management & Soft Deletion**: Only Admins can manage users and roles. Account deletion is performed via soft deletion (`deletedAt`). Deactivated accounts remain visible in the Admin User Management table with their status displayed. Soft-deleting an account immediately revokes all active refresh tokens for that user and blocks active JWT access tokens via real-time DB verification. Admins cannot deactivate, change the password of, or demote their own account or peer Admin accounts via the User Management endpoints (self-service password changes must go through the `/api/profile/change-password` endpoint). Public registration using a soft-deleted email returns a distinct notification (`409 Conflict`) instructing the user to contact an Administrator, while creating an account in User Management with an email belonging to a soft-deleted account returns `409 Conflict` directing the Administrator to use account reactivation instead. User management API rate limiting separates read operations (`GET /api/users`, `GET /api/users/roles` at 300 req/15min) from mutating actions (`POST`, `PATCH`, `DELETE` at 100 req/15min) to prevent high-frequency administrative workflows and NAT-shared IP environments from tripping false-positive rate limit locks.
- **Account Reactivation & Forced Password Change**: Admins can reactivate soft-deleted accounts directly via the dedicated reactivation toggle in the User Management table, confirmed via a modal popup. Accounts created or having their password reset by an Admin are trusted (`email_verified = true`), enforce NIST password guidelines (8–128 characters, zxcvbn strength >= 2), revoke all outstanding sessions immediately, and are flagged with `requires_password_change = true`. Upon logging in with an admin-assigned password, users receive a restricted setup token and must complete the Cloudflare Turnstile-protected password setup flow (`/setup-password`) before gaining access to standard protected routes. Setting a new password via the first-login setup flow is restricted strictly to local accounts (`auth_provider = 'local'`).

### Audit Trail

Every admin user-management action (create, reactivate, role change, password reset, deactivate)
and every security-relevant auth event (login success/failure, logout, first-login password set,
Google account linking, session revocation, OAuth state mismatch, refresh-token mismatch, OTP
verification/lockout) is recorded in `audit_logs` (§7). Read access is admin-only
(`GET /api/audit-logs`, `/summary`); there is no editor-facing or public view. `audit_logs` is
also where the tier-1 prose-builder override log (§5) belongs once that CMS work lands, rather
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
Jumlah Penduduk and Jumlah Keluarga on the Kependudukan page. Editor picks from pre-approved
sentence structures ("naik" / "turun" / "tetap") and maps only paired fields into slots — no
free-text claim authoring at Editor level. This is rendered, not human-authored, comparison
language.

Admin can author new sentence structures without a code deploy. Any new structure containing a
trend/comparison claim must place it in a proper conditional slot; a keyword check scans for
trend/superlative language (_meningkat, menurun, tertinggi, terendah_, etc.) appearing **outside**
that slot. Enforcement is **warn-on-save**, not a hard block — the warning restates the specific
flagged phrase and its consequence and requires acknowledgment tied to that exact wording (not a
generic dismiss). Overrides are logged for after-the-fact tracing only, not proactive catching —
see §6 for why.

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
names). 3 of these tables (`spatial_points`, `spatial_point_rt`, `rt_leaders`) are implemented
in `backend/prisma/schema.prisma` (migration `20260819000000_add_spatial_and_rt_tables`); the remaining
7 tables (`pages`, `chapters`, `sections`, `indicators`, `indicator_tables`, `indicator_table_rows`,
`content_blocks`) remain pending implementation. Translate into Prisma models with `@@map` when implementing.

| Table                                       | Purpose / key design notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`, `chapters`, `sections`             | Hierarchy per §2. No 1:1 constraint between chapter and section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `indicators`                                | Scalar figures. `value_current` / `value_previous` (nullable — null `value_previous` mechanically gates the tier-1 prose builder), `period_current` / `period_previous`, `is_computed_comparison`, `is_stale` (flags June 2024 Potensi fields), `source`, `hedge_note`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `indicator_tables` + `indicator_table_rows` | Normalized rows (not a JSON blob) for the 4 fixed-shape matrix tables — cells need to be queryable/computable. Manual entry only (§4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `spatial_points`                            | Ketua RT and Bank Sampah unit point records (~100, manual field survey). `type` ENUM, lat/lng, `metadata` JSON (MySQL has no JSONB). Feeds the interactive map, which is also an entry point to the Ketua RT page (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `spatial_point_rt`                          | Junction table (`point_id`, `rt_number`). Needed because Ketua RT points are always 1:1 with an RT, but a Bank Sampah unit can cover multiple RTs (e.g. one unit serving RT 30/72/60) — a flat `rt_number` column on `spatial_points` would be lossy. **Enforcement notes**: (1) The 1:1 invariant for `ketua_rt` points cannot be enforced with a partial unique index (`UNIQUE (point_id) WHERE type = 'ketua_rt'`) because MySQL does not support partial unique indexes. The write path (when a spatial-point write endpoint is added) must validate that a `ketua_rt` point references exactly one RT before committing. The read path (`maps.service.ts`) detects violations at query time: if `rts.length > 1` for a `ketua_rt` point, if multiple `ketua_rt` points are assigned to the same RT number, or if an RT coverage references an RT with no matching `rt_leaders` row, `rtLeader` is set to `null` and an `integrityWarning` field is included in the response so the anomaly is visible to callers and in server logs. (2) The FK from `rt_number` → `rt_leaders.rt_number` was intentionally dropped (migration `20260820000000`) because Prisma 7 requires a declared back-relation on both sides of a `@relation`, and adding `spatialPointRts SpatialPointRt[]` to the `RtLeader` model has no semantic meaning in this domain — the coordinate join is an asymmetric, query-time filtered read. In place of the FK, migration `20260826000000` adds `CHECK (rt_number BETWEEN 1 AND 100)` to enforce the valid RT range at the DB layer. Manggar has 100 RTs; if this changes, update the `BETWEEN` bounds in that migration and here. |
| `content_blocks`                            | Prose/narrative content. `section_id` nullable (populated for normal Cerita/stat-page prose tied to the hierarchy; null for standalone blocks like hero, Sambutan Lurah, landing highlights). `block_type` ENUM, `slug` (stable lookup key), `body` TEXT (tier-2 free text). `sort_order INT NULL` with `CHECK (section_id IS NOT NULL OR sort_order IS NULL)` — ordering only means something within a section; standalone blocks are unique named slots with no siblings to sort against.                                                                                                                                                                                      |
| `rt_leaders`                                | Single table, 100 rows (one per RT — not per-RT pages). `rt_number`, `name`, `phone`, `phone_is_whatsapp BOOLEAN` (some numbers aren't WhatsApp-registered — determines tap-to-chat vs. call-only rendering), `alamat` nullable (some addresses genuinely missing). No lat/lng column — coordinates are reached by joining `rt_leaders.rt_number` → `spatial_point_rt.rt_number` → `spatial_points.id`, filtered on `spatial_points.type` (required, not optional: a Bank Sampah unit covering RT 30/72/60 means `rt_number` is not unique in `spatial_point_rt`, so an unfiltered join also returns Bank Sampah points). Avoids duplicating/drifting lat-lng across two tables. |

No indicator-citation-tracking table exists. Cerita-page data citations (e.g. the Bank Sampah
page citing Ekonomi & Ketertiban figures) stay informal/manual in prose text, not structurally
linked.

Two more tables exist alongside the auth layer (`Role`, `User`, `RefreshToken`, `EmailOtp`),
implemented and out of scope for this schema pass in the same way those are:

- `audit_logs` — the audit trail (§3). `target_type`/`target_id` are deliberately not a foreign
  key, so it can log actions against any of the 10 content tables above once they exist, without
  a schema change. This is also where the §5 tier-1 prose-builder override log belongs.
- `system_settings` — generic key/value store; first (and so far only) use is admin-configurable
  audit log retention (§3). CMS settings introduced later should live here too rather than in a
  new table.

Weather widget data (§8) has no table here, and isn't merely uncovered by this pass — it's
out of scope for this schema entirely. It's fetched live from BMKG's public API and cached
in-memory by the backend process, not persisted to MySQL. There's no editorial value being
authored or versioned, so nothing needs storing.

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
round-trip, no pagination). The visible row count is announced as results change
("Menampilkan N dari 100 RT"). Rows remain sorted by `rt_number` and the unfiltered table is
the default state, so the page is fully usable with JavaScript-driven filtering ignored. No
RT-range grouping or collapsible bands — flat table only.

Accessibility implications, per `docs/ACCESSIBILITY.md`: the input needs a real `<label>` (not
placeholder-only), the result count belongs in an `aria-live="polite"` region, and the table
keeps proper `<caption>` / `<th scope>` semantics under filtering.

**Footer:**

- **Sumber Daya** — Publikasi (Prodeskel publications, infographics, Eco Boba booklet, etc.), Peta
  (interactive, QGIS-derived), Permintaan Data (PPID external pointer with request steps), Ketua RT.
- **Cerita** — links to the Cerita-labeled pages. Confirmed: the 7 stat pages + Persampahan & Bank
  Sampah Unit.
- **Tentang** — Kelurahan Manggar, Program Desa/Kelurahan Cantik, Inovasi Sosial VYOMATANTRA.
- **Kolaborasi** — three logos: Desa Cantik/BPS, ITK, Tim Insos VYOMATANTRA.

**Page inventory.** Three classes; this is the full set of pages, not a commitment to URL paths.

| Class       | Pages                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Cerita      | The 8 pages in §2                                                            |
| Sumber Daya | Publikasi, Peta, Permintaan Data, Ketua RT                                   |
| Tentang     | Kelurahan Manggar, Program Desa/Kelurahan Cantik, Inovasi Sosial VYOMATANTRA |

Plus the landing page itself.

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

_None currently open._
