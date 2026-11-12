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
- **Not** a PPID document host. The footer's **Permintaan Data** page (`/permintaan-data`) explains
  the public request path for data not published on the site: step-by-step guidance, a working-day
  timetable (UU 14/2008 Pasal 22 / 35–36 and local SOP), escalation (permohonan → keberatan →
  sengketa), and **links only** to official PPID Balikpapan forms. It never uploads, mirrors, or
  hosts PPID documents, and never labels Kelurahan public-setting contacts as PPID channels.

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
- The Ketua RT roster the repository ships is **synthetic only** (`backend/src/data/rtLeadersData.ts`):
  placeholder names, placeholder phone numbers, and generated coordinates. Real Ketua RT names, phone
  numbers, and home locations are personal data and must never be committed. Deployment seeds 100 empty slots;
  real names, phones, addresses, and coordinates enter through the CMS manual editor or CSV import. Synthetic
  contacts and coordinates stay development-only.
- Every RT-leader seed upsert carries `update: {}`. Re-running the seed fills in rows that are
  missing and nothing else; it must never revert a correction an editor has already made.
- Deleting a **seeded** Ketua RT spatial point (deterministic seed id) is also a correction: the
  delete path records the point id in `system_settings` key `maps.rt_seed_point_tombstones` (JSON
  id array) in the **same transaction** as the point delete and its audit row (SPEC §3). Re-seed
  skips tombstoned ids — it must not recreate the point or its default `spatial_point_rt` coverage.
  An empty database with no tombstones still seeds the full synthetic roster.
- Production seeds 100 empty Ketua RT slots (RT number only). Names, phone numbers, addresses, and
  coordinates enter only through the CMS/CSV import, so real roster data is never committed to the
  repository. Development seeds a fully synthetic roster and synthetic map points.
- The public "data contoh" sample-roster flag (`maps.rt_leaders_sample_roster`) is explicit: ordinary
  leader edits and CSV imports never change it. Only an Admin may flip it through
  `PATCH /api/maps/rt-leaders/sample-status`, which is audited. Production seeds it `false`;
  development seeds it `true` because its map coordinates are synthetic.
- RT editor location PATCH and DELETE requests include `expectedRtNumber` (1–100). Under the
  point lock the server requires a `ketua_rt` point with exactly that coverage, returning 409 if
  ownership, type or coverage changed and 404 if the point was deleted. Generic point clients may
  omit the parameter. On a stale response the editor preserves the draft, refreshes the roster,
  reports any contact changes already saved, and requires explicit RT reload before saving again.
- `GET /api/maps/rt-leaders` returns `{ leaders, total, isSampleRoster }`; the public sample notice
  follows this explicit flag and is never inferred from whether phone numbers look synthetic. The
  Ketua RT page revalidates the roster every 60 seconds while visible and when a hidden tab becomes
  visible after the cache expires. It keeps the last successful rows and sample flag together if a
  revalidation fails.
- `GET /api/pages` and `GET /api/pages/:slug` expose the hierarchy publicly (page → chapters →
  sections, each ordered by `sort_order`). `GET /api/pages?include=sections` returns every page
  with its chapters and sections in one request (one nested query), so a caller that needs all
  section labels — the CMS hierarchy — does not fire one detail request per page.
- `POST /api/pages`, `DELETE /api/pages/:slug`, and `PUT /api/pages/reorder` manage the Cerita page list
  (restricted to Editor and Admin roles, audited via `audit_logs`). Reordering updates page `sort_order`
  values in a single atomic database transaction with deterministic lock ordering to prevent deadlocks.
- The rest of the hierarchy is editable through the same Editor/Admin guards (details in §3): page title
  (`PATCH /api/pages/:slug`; the slug never changes), chapters and sections (create, retitle, delete,
  reorder), and prose blocks attached to a section (create, delete, reorder). Slugs for chapters,
  sections and prose blocks are generated from the title and never supplied by clients. Public
  hierarchy reads carry `updatedAt` on chapters and sections (and on a page in the `GET /api/pages/:slug`
  detail response, not in the `GET /api/pages` list): it is the concurrency token for the write that follows.

## 3. Roles

| Role   | Can do                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor | Edit data figures and prose; choose which comparison template an indicator uses (§5); manage the Cerita page list and hierarchy (pages, chapters, sections, section prose blocks, section figure); edit Sambutan Lurah; upload photos, documents and data files (§7 `media_assets`) |
| Admin  | Everything Editor can, plus user/role management and authoring new phrase-structure templates for the computed-comparison prose builder (§5)                      |

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
  - Deleting a page (`DELETE /api/pages/:slug`) cascades empty chapters/sections, blocks deletion (409 `HAS_DEPENDENTS`) while content blocks, indicators or indicator tables are attached beneath it, and records a `warning` audit log.
  - Reordering pages (`PUT /api/pages/reorder`) is atomic and validates against concurrent changes; a no-op reorder is not audited or written to the database.
  - Rate limiting for mutating page actions is per-user (100 req/15min).
- **Cerita Hierarchy Authoring Rules**: Editors and Admins manage chapters, sections and section prose blocks.
  All mutations are CSRF-protected, per-user rate limited (100 req/15min; pages, chapters and sections share one
  bucket, prose blocks use the content-block bucket), run in one transaction with their audit row, and invalidate
  the affected in-memory caches after commit.
  - Titles are 1–255 characters, trimmed, with no HTML tags and no control or bidi characters. Page rename
    (`PATCH /api/pages/:slug`) changes the title only; the slug is immutable so shared links keep working.
  - Chapter, section and prose-block slugs are generated from the title (kebab-case, diacritics stripped, at
    most 100 characters). The reserved-word list protects page slugs only (they are top-level routes such as
    `/admin`); chapter, section and prose-block titles like "Public" or "Admin" are ordinary. A collision gets
    `-2`, `-3`, … within its scope: the page for chapters, the chapter for sections, the whole table for prose
    blocks (`content_blocks.slug` is globally unique; the five standalone slugs are never available to prose
    blocks, so a clash resolves to the next free slug). A title that yields no slug is a 400. Clients
    never send a `slug`; unknown body fields are rejected.
  - New chapters, sections and prose blocks get `sort_order = max + 1` within their parent, taken under the
    parent's row lock. Deleting leaves gaps; reorder bodies are `{ expectedUpdatedAt, items: [{ id, sortOrder }] }`
    and must name every sibling exactly once with unique `sortOrder` values, otherwise 400.
  - **Concurrency.** Update, delete and reorder require `expectedUpdatedAt` (ISO 8601) — the target's own
    `updatedAt`, or the parent's for a reorder (`DELETE` sends it as a query parameter). A mismatch is
    `409` with code `STALE_WRITE` and `details.currentUpdatedAt`. Creating, deleting or reordering children also
    bumps the parent's `updatedAt`, so the parent token covers its ordered child list; every write response
    returns the fresh target and parent tokens. `DELETE /api/pages/:slug`
    requires it too (400 when missing or invalid), so a stale tab cannot delete a page that gained new
    chapters. The one exception kept for existing clients: `PATCH /api/content-blocks/:slug` accepts
    `expectedUpdatedAt` optionally and enforces it when present; whereas `PATCH /api/comparison-templates/:id`
    requires `expectedUpdatedAt` (ISO 8601 timestamp from `GET /api/comparison-templates` `updatedAt`) and
    returns `409` with code `STALE_WRITE` on mismatch. The existing page-list reorder has no parent
    and takes none.
  - **Locking.** Locks are taken parent-first (page → chapter → section → block) and children in ascending id
    order, so concurrent authoring cannot deadlock. A no-op reorder, and a retitle to the same title, write
    nothing and audit nothing.
  - **Deletion safety.** A page, chapter or section that still holds content blocks, indicators or indicator
    tables is not deleted: `409` with code `HAS_DEPENDENTS` and `details.dependencies` giving
    `{ contentBlocks, indicators, indicatorTables }` (summed over the sections beneath a page or chapter).
    A section's figure (below) counts as one content block, so a section with a figure is never deleted
    before the figure is removed. Only empty structure deletes, and the database `RESTRICT` foreign keys
    remain the backstop.
  - **Standalone blocks.** `hero`, `sambutan_lurah`, `highlight` and the profile/catalog blocks
    (`section_id` NULL) can be neither created nor deleted through these endpoints (delete: `409
    STANDALONE_BLOCK_PROTECTED`); they are edited only via `PATCH /api/content-blocks/:slug`.
  - **Section figure.** A section carries at most one figure: one photo, a group of 2–12 photos, or a
    diagram (a stored `figure` content block, §7). Editors and Admins manage it only through
    `PUT /api/sections/:id/figure` (body `{ expectedUpdatedAt, figure }`, creates or replaces) and
    `DELETE /api/sections/:id/figure?expectedUpdatedAt=` (`404 FIGURE_NOT_FOUND` when there is none);
    both are CSRF-protected, use the content-block write limiter, and run in one transaction with the
    section row lock, the media attach/detach and the audit row. They return the fresh section token
    (`section: { id, updatedAt }`, plus `block` on PUT). Saving an unchanged figure writes and audits
    nothing. The generic `PATCH`/`DELETE /api/content-blocks/:slug` refuse a figure block (`409
    FIGURE_BLOCK_PROTECTED`) so media bookkeeping cannot be bypassed. A figure is not a sibling of the
    section's prose blocks: it has no sort order, and prose create/reorder consider prose blocks only.
    - Shape: `{ kind: 'photo' | 'photos', photos: [{ mediaId, alt, caption?, credit? }] }` or
      `{ kind: 'diagram', title, source?, image?: { mediaId, alt }, bars?: { unit?, items: [{ label,
      value }] } }`. A diagram needs an image or bars. Limits: alt 1–300 characters (required),
      caption ≤ 200, credit ≤ 120, diagram title 1–120, source ≤ 200, 1–20 bars with labels 1–80 and a
      finite number value, unit ≤ 20. Text is trimmed (a blank optional field is dropped), unknown keys
      are refused, the same media asset may not appear twice in one figure, and text may contain no HTML
      tags or control/bidi characters. Every `mediaId` must be a `cerita`-purpose photo upload (§7).
    - Media is attached with reference `('content_block', <figure block id>, 'figure')` for every photo in
      the new figure and detached for photos the replaced figure had and the new one lacks; deleting the
      figure detaches all of its photos. An asset still referenced elsewhere stays published. Media
      failures answer a plain 400 (unknown, claimed or wrong-purpose photo).
    - Audit: `section.figure_saved` (info; `sectionId`, `kind`, `photoCount`) and
      `section.figure_deleted` (warning; `sectionId`, `kind`). Alt text, captions and credits are never
      logged.

### Audit Trail

Every admin user-management action (create, reactivate, role change, password reset, deactivate),
every page list mutation (page creation, deletion, reordering, rename), every media upload (`media.uploaded`, info) and the media cleanup run (`media.cleanup`, counts only),
every chapter, section and section prose block mutation (create, update, delete, reorder), every section figure save or delete,
and every security-relevant auth event (login success/failure, logout, first-login password set,
Google account linking, session revocation, OAuth state mismatch, refresh-token mismatch, OTP
verification/lockout) is recorded in `audit_logs` (§7). Read access is admin-only
(`GET /api/audit-logs`, `/summary`); there is no editor-facing or public view. `audit_logs` is
also where the tier-1 prose-builder override log (§5) lives (`comparison_template.keyword_warning_overridden`), rather
than a second table — `target_type`/`target_id` are unconstrained (no FK) specifically so future
content tables (indicators, prose, RT leaders, etc.) can be audited without a schema change.

Legacy development RT sample cleanup (`maintenance.legacy_rt_cleanup`) is recorded once, in the
same transaction as any changed point/coverage/leader rows. It uses warning severity and a system
actor; metadata contains source, row counts, force/environment context, and timestamp only—never
leader names or phone numbers. A no-op cleanup writes no database audit row. Both the non-production
seed and the maintenance CLI call the shared cleanup service. The CLI refuses production unless
`--force` is supplied.

- **Severity is fixed per action, not chosen per call site** — `info` / `warning` / `critical`,
  defined once in `backend/src/services/audit.service.ts`'s `AUDIT_ACTIONS` table. `critical`
  covers privilege-affecting or credential-affecting events (role changes, admin password
  resets, Google account linking, OAuth/refresh-token integrity failures, OTP lockout, and
  retention-policy changes themselves). Hierarchy and prose-block deletions are `warning`; their other
  actions are `info`, and their metadata holds ids, slugs, titles and counts only (a deleted block records
  its body length, never the body). A `critical` row stays open (`acknowledgedAt = null`)
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
  > = `info` (treating `0` as infinite) — a more severe event may not be discarded before a less
  > severe one. Changing retention is itself logged at `critical` severity with before/after
  > values, since shortening it is the single most useful move for covering one's tracks. Pruning
  > executes outside the running app, via a separate privileged DB connection
  > (`backend/scripts/prune-audit-logs.ts`), never through the app's own (deliberately
  > DELETE-incapable) runtime user. The Admin screen is the "Retensi log" section of Konfigurasi
  > sistem (§8): severities are named as in the system log (Info, Peringatan, Kritis), keep-forever is a
  > "Simpan selamanya" checkbox instead of the number `0`, a limit must be at least one day, the order
  > rule is checked as the Admin types, and the section states that unacknowledged critical rows are
  > never deleted. Save failures show approved wording, never the server's sentence.

## 4. Data Entry

Hybrid model:

- **Scalar indicator figures** — manual, form-based entry. Bulk XLS import is deferred and out
  of current scope; it depends on a Prodeskel XLS export that has not been confirmed to exist.
  If such an export is confirmed later, import would layer on top of manual entry, not replace
  it.
- **Matrix/table-shaped data** (age pyramid, 17-group ethnicity, religion×sex, occupation table —
  4 fixed-shape tables) — manual, form-based entry only. Bulk import is explicitly out of scope
  for these.
- **Prose & Standalone Content Blocks** — field-by-field forms (tier-1 builder or tier-2 free text; see §5). Standalone landing content blocks (`landing-hero`, `landing-sambutan-lurah`, `landing-highlights`) are managed via `/api/content-blocks`. Specifically, the hero block manages `title`, `body`, and optional `backgroundImage`; `badge` and call-to-action buttons were removed to maintain a clean institutional profile voice without redundant action buttons. Blocks attached to a section are created, deleted and reordered through the Cerita authoring API (§3); the standalone blocks are fixed slots that are only edited, never created or deleted.

The frontend surface is the `/data` view (`DataManagementView`, editor/admin only, mounted inside
the admin base layout shell from §8), organized into three accessible tabbed categories:

1. **Indikator & Tabel (default):** A searchable, type-filterable card list of every scalar indicator
   and matrix table, each opening an accessible edit dialog. It is edit-only — an indicator or table
   must attach to a `section`, and no section-management surface exists, so create/delete are not in
   the UI rather than shipped as forms that cannot submit. "Import From" from the wireframe is not
   built, consistent with the scope above. The previous-year pair is edited independently of
   `is_computed_comparison`: a pair alone does not promote an indicator into the tier-1 computed set
   (§5), so the flag is preserved as stored and is only cleared when the pair is cleared, since the
   service rejects a computed flag with no pair. Clearing the pair also detaches any tier-1 template
   in the same request, as §5 requires. Saves survive the 15-minute access-token lifetime: the
   shared API client refreshes the session once via `POST /api/auth/refresh` and replays the request,
   so a form left open does not lose its draft; if the refresh is denied, the save fails with an
   explicit session-ended message and the open form keeps its contents. A background refetch of the
   same indicator also leaves the open draft untouched — both forms key their draft on the record
   id, so only opening a different record resets it.

2. **Blok Konten & Profil:** Displays an editable card for every content block: the five standalone
   blocks (`landing-hero`, `landing-sambutan-lurah`, `landing-highlights`, `tentang-kelurahan-profil`,
   `publikasi-katalog`) and any block attached to a Cerita section. Cards and dialogs name a block by its
   title and say where residents see it ("Tampil di: Beranda, bagian atas"); slugs and block types are
   never shown. `ContentBlockForm` is a thin dispatcher to one named form per block purpose, all sharing the
   title (up to 255 characters) and body (up to 50,000 characters) fields:
   - **Hero**: optional background image address. **Sambutan Lurah**: name, official title, optional portrait
     address. **Profil Kelurahan**: RT count, kecamatan, kota, landscape, Lurah, boundaries and the SOTK roster.
     Photo and background fields stay plain address text until the photo picker replaces them.
   - **Potensi unggulan** (`landing-highlights`): repeatable rows of Judul (up to 100 characters) and Deskripsi
     (up to 500), at most 10, saved as `metadata.items[]`. Decision D1: no public page reads this block, so it
     stays editable but is labelled "Tidak ditampilkan di situs", and the form says so; it is not described as
     changing the landing page.
   - **Katalog Publikasi**: repeatable rows of kategori, judul, deskripsi, optional sumber rujukan (the citation),
     optional tautan unduhan, format and size (entered in KB or MB, saved as whole bytes; an untouched size is
     saved byte-for-byte), at most 25, saved as `metadata.publications[]`. Availability is derived from the link
     (a link means `isAvailableOnline`, no link means "Segera hadir"), so the server's link/availability rule
     cannot be violated. Links must start with `https://`. A saved empty list stays empty and is not refilled
     with the built-in catalog (settled D2); the built-in list is only offered for a block that never stored one.
   - **Cerita section blocks**: title and body only; the save sends no metadata, so stored metadata is untouched.
   - Any other block opens no editor, only "Blok ini belum bisa diubah dari sini. Hubungi pengelola teknis."
     (no data is shown). **No JSON or code editor exists in any role or state.**
   Repeatable rows are reordered with Naik / Turun buttons (never drag-only) and removed with Hapus; each row
   shows its own errors tied to the field, and focus and a live-region message follow every add, move and
   remove. Mutations use `PATCH /api/content-blocks/:slug` (audited as `content_block.updated`) with prototype
   pollution guards and URL validation. Every save sends the block's `updatedAt` as `expectedUpdatedAt`; a
   `STALE_WRITE` refusal keeps the whole draft in the open dialog, shows the approved stale-write message and
   offers "Muat versi terbaru", which replaces the draft with the stored block only when the editor asks.
   Any failed save keeps every field as typed.

3. **Pengaturan Publik Portal** (Admin only): a short note and a link to Konfigurasi sistem
   (`/admin/sistem/konfigurasi`), which owns the portal settings (§8). Those settings are the identity
   settings (`public.app_name`, `public.institution_name`, `public.tagline`,
   `public.administrative_area`), the public contact channels (`public.contact_phone`,
   `public.contact_whatsapp`, `public.contact_email`, `public.contact_address`), and the default map
   view (`public.default_coordinates`, edited visually on a map picker: staff pan and zoom the map
   instead of typing latitude, longitude or a zoom number; the stored value stays `{ lat, lon, zoom }`).
   Identity/contact and the map view are separate forms with separate saves. Mutations use
   `PATCH /api/settings/public` (audited as `settings.public_updated`); a part form sends only its own
   fields.

A matrix-table save is one atomic request: `PATCH /api/indicator-tables/:id` carries the table
header plus every changed row (at most 500) and applies them in a single transaction, mirroring
the nested `rows` that `POST /` already accepts. A rejected row therefore leaves the table
untouched — never a sex-split row with a new `male` and the old `female` — and the dialog keeps
every draft, including rows that were not part of the failed save.

A cell may be left empty. The cell columns are nullable, and an empty cell means "not recorded
yet", not zero — so the form treats every number cell as optional and sends `null` for a blank
one, letting an editor save a header or label change without inventing a figure. A sex-split
row's derived `total` is `null` until both `male` and `female` are filled, never a partial sum
that would understate the row on a public page.

Two consequences of the batch shape are deliberate. First, a large save is audited per row: 500
changed rows produce 500 `indicator_table_row.updated` entries inside that one transaction, so
the audit trail stays row-granular rather than collapsing into a single summary. Second,
`rowKey` renames are validated against the final key set, not the current one, so a swap
(`A→b`, `B→a`) succeeds; the service parks renamed rows on a temporary key before writing the
final ones, because `UNIQUE (table_id, row_key)` is enforced per statement. The CMS does not
expose `rowKey` editing today — this is an API-level capability. Keys beginning with `tmp:` are
reserved for that temporary parking and rejected by the row-key schema, so a real row can never
occupy one.

The Cerita views, public pages, and the CMS keep separate caches over the same rows. A successful save
invalidates the Cerita entry for the affected section, updates `bySlug` and local stores, and forces the
next public visit to refetch rather than render pre-edit values.

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

**Authoring and selection UI.** Admin authors templates at *Sistem → Templat kalimat*
(`/admin/sistem/templat-kalimat`, Admin-only; an Editor is redirected even by direct URL). Editors
only choose: `ScalarIndicatorForm` shows a "Templat kalimat perbandingan" selector, with a
"Tanpa templat" option, when the indicator is already flagged `is_computed_comparison` **and** its
draft has both a previous value and a previous period; a pair alone never makes it appear, and
clearing the pair still detaches the template in the same request.

- **No syntax is shown to people.** The sentence is edited as an ordered list of parts (free text
  and named chips) with add, remove and move up/down buttons — no textarea showing braces, no
  drag-only ordering. Chips are UI-only names for the slots: Nama indikator `{label}`, Satuan
  `{unit}`, Nilai sekarang `{value_current}`, Nilai sebelumnya `{value_previous}`, Periode sekarang
  `{period_current}`, Periode sebelumnya `{period_previous}`, Selisih `{delta}`, Persentase
  perubahan `{delta_percent}`, Keterangan perubahan `{trend}`. Stored data and the API are
  unchanged. Free text drops braces as typed; any unrecognised or legacy braces in an existing
  body parse into a removable "Bagian tidak dikenali" part and block saving until removed.
- **Fields.** Nama templat (`label`), Susunan kalimat (`body`, exactly one "Keterangan perubahan"
  chip; a second cannot be added), Saat nilai naik / turun / tetap (`trendNaik` / `trendTurun` /
  `trendTetap`; every chip except "Keterangan perubahan"). The `slug` is generated from the name on
  create (suffix `-2`, `-3`… on collision, retried if another admin takes it first), never shown,
  never edited.
- **Live preview** comes from `POST /api/comparison-templates/preview` (Admin-only, CSRF, own
  per-user limiter of 1000 req/15min, behind a separate generous pre-auth IP guard rather than the
  shared public `apiLimiter`), which renders the draft through the same `renderComparison` the public read
  path uses over synthetic naik / turun / tetap / zero-previous examples, so exact decimals, id-ID
  numbers and the "no percentage of a zero base" rule are identical. An unfinished draft answers 200
  with `valid: false` and plain-language `problems`; it stores and audits nothing. The client
  debounces it and skips it while its own checks fail.
- **Trend-keyword acknowledgment.** On `422 TREND_KEYWORD_ACK_REQUIRED` the form lists each flagged
  phrase with a plain warning and one confirmation checkbox per phrase; the app echoes the `ackKey`s
  in `acknowledgedWarnings` and clears them after any edit to the main sentence. Status, code and
  key are never displayed, and the server's 400/422 sentence (which quotes placeholder syntax) is
  never shown for template saves — only approved wording from `toUserMessage`.
- **Delete.** Confirmation names the template. An in-use template (usage count > 0, or a `409`)
  explains with the count that indicators must be detached or reassigned first. The "Terpasang"
  badge derives from `usageCount`.

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

11 tables. Scope is content data only — CMS/admin tables (roles, prose-builder templates,
override logs) are a separate concern and not covered by this pass. (The existing `Role`, `User`,
`RefreshToken`, and `EmailOtp` tables in `schema.prisma` are the auth layer, already implemented, and distinct
from the tables below.)

This section expresses design intent in raw-DDL vocabulary (`ENUM`, `CHECK`, snake_case table
names). All 11 tables are implemented in `backend/prisma/schema.prisma`: `spatial_points`,
`spatial_point_rt`, `rt_leaders` (migration `20260819000000_add_spatial_and_rt_tables`),
`content_blocks` (migration `20260917103839_add_content_blocks`), `pages`, `chapters`, `sections`
(migration `20261009000000_add_content_hierarchy`), `indicators` in migration
`20261010011827_add_indicators`, and `indicator_tables`, `indicator_table_rows` in migration
`20261010120000_add_indicator_tables`, and `media_assets` in migration `20261107000000_add_media_assets`. Translate into Prisma models with `@@map` when
implementing.

| Table                                       | Purpose / key design notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`, `chapters`, `sections`             | Hierarchy per §2. No 1:1 constraint between chapter and section. `updatedAt` on each is the optimistic-concurrency token for authoring (§3); public reads return it for chapters and sections (in every page read) and for the page itself in `GET /api/pages/:slug`; the `GET /api/pages` list summaries omit it. Read-only via `GET /api/pages`, `GET /api/pages?include=sections`, `GET /api/pages/:slug`. Editor/Admin writes (CSRF-protected, per-user write rate limit, audited in the same transaction; rules in §3): `POST /api/pages`, `PATCH /api/pages/:slug` (title only), `DELETE /api/pages/:slug`, `PUT /api/pages/reorder`; `POST /api/pages/:slug/chapters` (body `{title}`), `PUT /api/pages/:slug/chapters/reorder`, `PATCH /api/chapters/:id` (`{title, expectedUpdatedAt}`), `DELETE /api/chapters/:id?expectedUpdatedAt=`; `POST /api/chapters/:id/sections` (`{title}`), `PUT /api/chapters/:id/sections/reorder`, `PATCH /api/sections/:id` (`{title, expectedUpdatedAt}`), `DELETE /api/sections/:id?expectedUpdatedAt=`. Reorder bodies are `{expectedUpdatedAt, items:[{id, sortOrder}]}` against the parent's token. Audited as `page.updated`, `chapter.created`/`.updated`/`.deleted`/`.reordered`, `section.created`/`.updated`/`.deleted`/`.reordered` (deletes at warning). Delete is blocked (409 `HAS_DEPENDENTS`) while sections beneath still hold content blocks, indicators or indicator tables; the `ON DELETE RESTRICT` FKs on those tables remain the backstop, and chapter/section deletes cascade only empty structure. |
| `indicators`                                | Scalar figures. `value_current` / `value_previous` (nullable — null `value_previous` mechanically gates the tier-1 prose builder), `period_current` / `period_previous`, `is_computed_comparison`, `is_stale` (flags June 2024 Potensi fields), `source`, `hedge_note`. `section_id` required FK to `sections.id` (`ON DELETE RESTRICT` — a section holding indicators cannot be deleted until they are removed through the audited API, consistent with `content_blocks`). Read via public `GET /api/indicators` and `GET /api/indicators/:id` (in-memory cached; the by-id route resolves an ID first, then falls back to a case-insensitive slug match; DTO returns `pageSlug` resolved from the section → chapter → page hierarchy). Mutated via editor/admin-only `POST` / `PATCH /:id` / `DELETE /:id` (CSRF-protected, logged in `audit_logs` as `indicator.created` / `indicator.updated` / `indicator.deleted`). `comparison_template_id` nullable FK to `comparison_templates` (§5 tier-1; the read DTO carries the rendered `comparison` and `pageSlug`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `indicator_tables` + `indicator_table_rows` | Normalized rows (not a JSON blob) for the 4 fixed-shape matrix tables — cells need to be queryable/computable. Manual entry only (§4). Wide-row shape: one row per logical group with nullable `INT` cells — `male`/`female` for the sex-split kinds (`age_pyramid`, `religion_by_sex`), `total` for the single-value kinds (`ethnicity`, `occupation`); enforced per-kind in the service. `total` for sex-split rows is derived on read (`male + female`), never stored alongside them, so the two cannot drift. Single `period` (June 2024 Potensi point-in-time snapshots, no tahun-lalu pairing — §6). `section_id` required FK to `sections.id` (`ON DELETE RESTRICT`, consistent with `indicators`/`content_blocks`); rows cascade with their table; `UNIQUE (table_id, row_key)`. Read via public `GET /api/indicator-tables` (filterable by `sectionId`/`kind`) and `GET /api/indicator-tables/:key` (slug-or-id, returns rows + SQL-`SUM` totals, in-memory cached); mutated via editor/admin-only `POST /` (optional nested `rows` in one transaction), `PATCH /:id` / `DELETE /:id`, `POST /:id/rows`, `PATCH /rows/:rowId` / `DELETE /rows/:rowId` (CSRF-protected, logged in `audit_logs` as `indicator_table.created` / `indicator_table.updated` / `indicator_table.deleted` and `indicator_table_row.created` / `indicator_table_row.updated` / `indicator_table_row.deleted`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `spatial_points`                            | Ketua RT and Bank Sampah unit point records (~100, manual field survey). `type` ENUM, lat/lng, `metadata` JSON (MySQL has no JSONB) with a write-path cap of 8 000 characters serialized — saved values are echoed back in every public points payload, so the fence keeps map loads cheap. Feeds the interactive map, which is also an entry point to the Ketua RT page (§8). Write path (editor/admin only, CSRF-protected, user-keyed write rate limit): `POST` / `PATCH /api/maps/points/:id` / `DELETE /api/maps/points/:id` (audited as `spatial_point.created` / `.updated` / `.deleted`), plus the RT coverage subresource `POST` / `DELETE /api/maps/points/:id/rts(/:rtNumber)` (audited as `spatial_point_rt.created` / `.deleted`); coverage can also be replaced wholesale via `rts` on create/PATCH, logged in the `spatial_point.updated` metadata as added/removed RTs. The coverage subresource endpoints exist for `bank_sampah`/`fasilitas_umum` coverage edits (and emergency repair of a legacy `ketua_rt` row): on a well-formed `ketua_rt` point they always fail with 400 — adding one RT would take the point to two coverages, removing its only one to zero — so an in-spec `ketua_rt` RT change goes exclusively through `rts` on PATCH. `rt_number` inputs are validated 1–100 (mirroring the DB CHECK in `20260826000000`; the dropped FK means existence in `rt_leaders` is intentionally NOT required — orphaned coverage is a read-path `integrityWarning`). Each mutation and its audit row share one transaction: the point row is locked `FOR UPDATE` first, then — for a write that is or makes the point `ketua_rt` (a bank_sampah/other point, never exclusive on an RT, skips them) — the touched `rt_leaders` rows (the point's old ∪ new RT set, locked in ascending order, before any coverage write) so that two same-RT writers cannot interleave into a deadlock, with the write-path invariant assert backed by a target-RT-scoped `FOR SHARE` locking read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `spatial_point_rt`                          | Junction table (`point_id`, `rt_number`). Needed because Ketua RT points are always 1:1 with an RT, but a Bank Sampah unit can cover multiple RTs (e.g. one unit serving RT 30/72/60) — a flat `rt_number` column on `spatial_points` would be lossy. **Enforcement notes**: (1) The 1:1 invariant for `ketua_rt` points cannot be enforced with a partial unique index (`UNIQUE (point_id) WHERE type = 'ketua_rt'`) because MySQL does not support partial unique indexes. The write path now adds the missing enforcement on every type/coverage write (see the `spatial_points` row): before committing, the post-write global `ketua_rt` coverage state is re-derived and run through the same shared resolution rule the read paths use (`resolveRtCoverage` in `maps.service.ts`) — a `ketua_rt` point ending up with more or fewer than exactly one RT is rejected with 400, an RT ending up covered by more than one `ketua_rt` point is rejected with 409. The check is scoped to the point being written and only runs when the write touches the point's type or coverage, so field-only edits on legacy-violating rows stay possible and every violation is repairable via a coverage write; violations untouched by a given write remain read-side `integrityWarning` territory, i.e. the read path is now a safety net rather than the only guard. Unit tests pin the 1:1 invariant (`src/__tests__/maps.service.write.test.ts`). The read path (`maps.service.ts`) detects violations at query time via one shared resolution rule applied on both sides of the join: an RT resolves to a `ketua_rt` point only if exactly one `ketua_rt` point covers it **and** that point covers exactly one RT. On the points side (`GET /api/maps/points`, `/points/:id`) a violation sets `rtLeader` to `null`; on the leaders side (`GET /api/maps/rt-leaders`, `/rt-leaders/:rtNumber`) it sets `coordinates` to `null`. In both cases an `integrityWarning` field describes the anomaly (multiple `ketua_rt` points on one RT, a `ketua_rt` point spanning several RTs, or an RT coverage referencing an RT with no matching `rt_leaders` row), and the anomaly is logged server-side. `GET /api/maps/summary` applies the same rule: conflicted RTs are excluded from `rtLeadersWithCoordinates` (so they fall into `rtLeadersWithoutCoordinates`) and are additionally reported via `rtLeadersWithIntegrityConflicts`, so a data problem is visible from the summary endpoint without cross-referencing the points list. (2) The FK from `rt_number` → `rt_leaders.rt_number` was intentionally dropped (migration `20260820000000`) because Prisma 7 requires a declared back-relation on both sides of a `@relation`, and adding `spatialPointRts SpatialPointRt[]` to the `RtLeader` model has no semantic meaning in this domain — the coordinate join is an asymmetric, query-time filtered read. In place of the FK, migration `20260826000000` adds `CHECK (rt_number BETWEEN 1 AND 100)` to enforce the valid RT range at the DB layer. Manggar has 100 RTs; if this changes, update the `BETWEEN` bounds in that migration and here. |
| `content_blocks`                            | Prose/narrative content. `section_id` nullable FK to `sections.id` (`ON DELETE RESTRICT` — a section that still has blocks cannot be deleted, since MySQL forbids `SET NULL`/`CASCADE` on a column used in the `CHECK` below; populated for normal Cerita/stat-page prose tied to the hierarchy; null for standalone blocks like hero, Sambutan Lurah, landing highlights). `block_type` ENUM (`hero`, `sambutan_lurah`, `highlight`, `prose`, `figure`; `figure` added in migration `20261113000000_add_figure_content_block_type`), `slug` (stable lookup key), `body` TEXT (tier-2 free text). `sort_order INT NULL` with `CHECK (section_id IS NOT NULL OR sort_order IS NULL)` — ordering only means something within a section; standalone blocks are unique named slots with no siblings to sort against. Read via public `GET /api/content-blocks` and `GET /api/content-blocks/:slug` (in-memory cached); mutated via `PATCH /api/content-blocks/:slug` (Editor or Admin only, CSRF-protected, logged in `audit_logs` as `content_block.updated`). Section prose blocks (`block_type` `prose`, `section_id` set) are authored via Editor/Admin `POST /api/sections/:id/content-blocks` (body `{title, body}`; slug generated from the title, `sort_order` = max + 1 within the section), `PUT /api/sections/:id/content-blocks/reorder` (`{expectedUpdatedAt, items}` against the section's token) and `DELETE /api/content-blocks/:slug?expectedUpdatedAt=` (audited as `content_block.created` / `.reordered` / `.deleted`, deletes at warning; body never logged). `PATCH /:slug` accepts an optional `expectedUpdatedAt`. Standalone singleton blocks (`section_id` NULL) are never created or deleted through the API (409 `STANDALONE_BLOCK_PROTECTED`). A `figure` block (§3 Section figure) has `section_id` set, `sort_order` NULL, `title` NULL, `body` `''`, `metadata` the figure JSON and the deterministic slug `figure-<sectionId>`, which with the global unique slug also enforces one figure per section; it is written only through `PUT`/`DELETE /api/sections/:id/figure` (audited as `section.figure_saved` / `section.figure_deleted`) and the generic PATCH/DELETE answer 409 `FIGURE_BLOCK_PROTECTED`. Figure blocks appear in `GET /api/content-blocks` with `type: 'figure'`. |
| `rt_leaders`                                | Single table, 100 rows (one per RT — not per-RT pages). `rt_number`, `name`, `phone`, `phone_is_whatsapp BOOLEAN` (some numbers aren't WhatsApp-registered — determines tap-to-chat vs. call-only rendering), `alamat` nullable (some addresses genuinely missing). No lat/lng column — coordinates are reached by joining `rt_leaders.rt_number` → `spatial_point_rt.rt_number` → `spatial_points.id`, filtered on `spatial_points.type` (required, not optional: a Bank Sampah unit covering RT 30/72/60 means `rt_number` is not unique in `spatial_point_rt`, so an unfiltered join also returns Bank Sampah points). Avoids duplicating/drifting lat-lng across two tables. Edit path: editor/admin-only `PATCH /api/maps/rt-leaders/:rtNumber` (CSRF-protected, user-keyed write rate limit, audited as `rt_leader.updated`) covering `name`, `phone`, `phone_is_whatsapp`, and nullable `alamat`; `rt_number` is validated 1–100 and the row must exist (404). The 100 rows are seeded; there is no create or delete endpoint, and no per-RT pages (§2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `media_assets` + `media_asset_references`   | Uploaded photos, documents and data files. One service for all three kinds. `id`, `provider` (`local`), `storage_key` (relative path under `UPLOAD_DIR`, unique), `kind` ENUM (`photo`, `document`, `data`), `purpose`, `owner_key`, `mime_type`, `byte_size`, nullable `width`/`height`, `original_name` (display only, sanitized, never part of a path), `created_by_id` FK → `users` (`ON DELETE SET NULL`), `created_at`, `attached_at` (null = unattached/private), `detached_at` (set by `detachMedia`, cleared by `attachMedia`; starts the cleanup grace period for a swapped-out asset, migration `20261108000000_add_media_assets_detached_at`), `cleanup_claimed_at` (nullable datetime, irreversible deletion claim set before unlinking files, migration `20261110000000_add_media_lifecycle_columns`), `cleanup_quarantine_reason` (nullable varchar(64), set to `'invalid-path'` if `storage_key` escapes upload root). `media_asset_references` tracks persistent reference ownership tuples `(reference_type, reference_id, slot, asset_id)` (`UNIQUE` index `media_asset_references_tuple_key`, `asset_id` index, `ON DELETE RESTRICT ON UPDATE RESTRICT` FK to `media_assets.id`). No processing state machine. **Storage**: bytes live under `UPLOAD_DIR` (default `<repo-root>/uploads`; relative values resolve against the repository root, never the working directory; absolute values are used as-is). Boot creates it, proves it writable, and rejects a root whose real path overlaps `backend/` or `frontend/`; a rejected or unusable root does not stop the server: it logs a loud warning, media uploads and delivery answer 503 `MEDIA_STORAGE_UNAVAILABLE` (no path in the body), and a failed check is never cached, so media recovers once the storage is usable. The path is never exposed in an API response or public setting. Layout: `photos/<purpose>/<ownerKey>/<assetId>.webp`, `documents/<purpose>/<ownerKey>/<assetId>.<ext>` (documents and data), `derivatives/<assetId>/thumbnail.webp`, `_staging/<uploadId>/`. `assetId` is a random UUID. `purpose` is a server-side allowlist (`portal-hero`, `sambutan-lurah`, `cerita`, `tentang`, `publikasi-cover`, `publikasi-document`, `sumber-daya-data`), each allowing specific kinds. `owner_key` is server-determined: a fixed key for singleton purposes (`hero`, `lurah`), the uploader's user id otherwise. **Policy** (named constants in `backend/src/utils/mediaPolicy.ts`): photos JPEG/PNG/WebP ≤ 5 MiB, documents PDF/DOCX ≤ 20 MiB, data XLSX/CSV ≤ 10 MiB; SVG, HTML, executables, archives and macro-enabled Office are rejected. Type is decided by file signature, not extension or client MIME, and the declared extension must agree with it; DOCX/XLSX need `[Content_Types].xml` plus `word/document.xml` or `xl/workbook.xml` and must contain no `vbaProject.bin` or macro content type (time-boxed central-directory check, nothing is extracted); CSV must be UTF-8 text without NUL or control characters, and no cell may start with `=`, `+`, `-`, `@`, TAB or CR (spreadsheet formula injection) unless the cell is only a signed number or phone number (sign, optional space, a digit, then digits, spaces, `.`, `,`, `%` and `-` only, e.g. `-5`, `-5%`, `-1.234,56`, `+62 812-3456-7890`); `=` and `@` leads are always refused; the upload is refused (`CSV_FORMULA`, 415) with a message telling the editor to prefix the value with an apostrophe. The scan is a streaming RFC 4180 tokenizer (`backend/src/utils/mediaCsv.ts`), so memory stays bounded for any file size. **Photos are re-encoded** with sharp to WebP: EXIF/GPS and all other metadata are dropped, input pixels are bounded, the long edge is capped at 2560 px, and a 320 px thumbnail is written. **Upload** `POST /api/media` (Editor or Admin, CSRF-protected, user-keyed write rate limit): multipart `file` + `purpose`, one file per request, staged on disk and deleted on any failure; audited as `media.uploaded` (info; ids, purpose, kind and size only, never bytes, server paths or the filename). The response is `{ id, kind, mimeType, byteSize, width, height, originalName, previewUrl }`, where `previewUrl` is an API path, not a browser-loadable URL (see Delivery). **Delivery**: `GET /api/media/:id/preview` (Editor or Admin) serves any asset including unattached; `GET /api/media/:id` (public) serves photos and `GET /api/media/:id/download` (public) serves documents/data, both only when `attached_at` is set, otherwise 404 indistinguishable from a missing id; `?variant=thumbnail` selects the thumbnail of a photo. Every response resolves `storage_key` under the canonical root with a realpath containment check, takes `Content-Type` from the stored extension (not the DB column or the client), sets `X-Content-Type-Options: nosniff` and a `default-src 'none'; sandbox` CSP, and a missing file is a plain 404 with code `MEDIA_FILE_MISSING` and no path. Assets claimed for deletion (`cleanup_claimed_at IS NOT NULL`) or quarantined (`cleanup_quarantine_reason IS NOT NULL`) return 404 immediately. Attached assets are cached `public, max-age=3600, must-revalidate` (an hour, so un-publishing via `detachMedia` takes effect promptly; not `immutable`); previews are `private, no-store` and authenticate with the `Authorization` header only (no cookie, no signed URLs — settled), so the editor UI must load them with the authenticated API client and display a blob URL; a bare `<img src>`/`<a href>` gets 401. Documents and data are only ever sent as `Content-Disposition: attachment` with a sanitized filename carrying the stored extension. **Lifecycle**: an upload is private until a content transaction calls `attachMedia(tx, assetIds, { purpose, reference })` (backend/src/services/media.service.ts), which locks target rows `FOR UPDATE`, validates that each asset exists, was uploaded for that purpose, and is not claimed for deletion or quarantined, records the `(reference_type, reference_id, slot, asset_id)` tuple idempotently in `media_asset_references`, sets `attached_at = now` when previously unattached, and clears `detached_at`. `detachMedia` deletes the matching reference tuple from `media_asset_references` and unpublishes (`attached_at = null, detached_at = now`) only when 0 references remain for that asset (idempotent if already unattached, and a no-op if deleted by cleanup). Content PRs call these inside their own transactions. Section figures (§3) reference photos as `('content_block', <figure block id>, 'figure')` with purpose `cerita`. `npm run media:cleanup` (scheduled, see README Deployment) removes `_staging/` directories and unattached assets whose grace period (default 24 h) has passed, measured from `COALESCE(detached_at, created_at)` so an old asset that content just replaced is not deleted by the very next run. Cleanup validates paths first (quarantining escaped paths with `cleanup_quarantine_reason = 'invalid-path'` without claiming deletion), locks unclaimed eligible rows `FOR UPDATE` to verify zero references and commit an irreversible `cleanup_claimed_at` timestamp before removing files, keeps `cleanup_claimed_at` set across failed removals for retry on the next run, and deletes the DB row once files are absent. The app DB user keeps full DML on both tables (grants script). |

No indicator-citation-tracking table exists. Cerita-page data citations (e.g. the Bank Sampah
page citing Ekonomi & Ketertiban figures) stay informal/manual in prose text, not structurally
linked.

Three more tables exist alongside the auth layer (`Role`, `User`, `RefreshToken`, `EmailOtp`),
implemented and out of scope for this schema pass in the same way those are:

- `audit_logs` — the audit trail (§3). `target_type`/`target_id` are deliberately not a foreign
  key, so it can log actions against any of the 11 content tables above once they exist, without
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
  without code redeployment. These knobs stay in the protected API; they are not moved to environment
  variables. The Admin screen exposes only the refresh interval, as three named choices ("Setiap 30
  menit", "Setiap 1 jam (standar)", "Setiap 2 jam" = `weather.cache_ttl_ms` 1 800 000 / 3 600 000 /
  7 200 000), and sends `cacheTtlMs` alone, so the BMKG address, retry wait and request timeout keep
  their stored values and are never shown in the CMS. A stored interval that matches no choice appears
  as "Pengaturan khusus (N menit)", is not changed on load, and is replaced only when an Admin picks a
  named choice. The choice sets how often the site checks for updates, not how often BMKG publishes.
  The weather area is fixed to Manggar: the screen shows its name read-only and offers no selector, and
  `public.weather_adm4` is not editable from the CMS.

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
  `comparison_template.created` / `.updated` / `.deleted`, plus the override action in §3;
  `PATCH /:id` carries required `expectedUpdatedAt` and answers 409 `STALE_WRITE` on concurrent modification;
  unique-slug conflicts on `POST` and `PATCH` answer 409 `SLUG_TAKEN`),
  and the Admin-only, stateless `POST /preview` of §5 (no table access, no audit row).
  Seeded with a default `perbandingan-tahunan` template.

Weather widget data (§8) has no table here, and isn't merely uncovered by this pass — it's
out of scope for this schema entirely. It's fetched live from BMKG's public API and cached
in-memory by the backend process, not persisted to MySQL. There's no editorial value being
authored or versioned, so nothing needs storing. Operational knobs governing its fetching and
caching live in `system_settings` as a separate operational concern.

## 8. Site Structure

**Public shell.** Every public page is mounted inside one layout (`PublicLayout.vue`, selected by
`meta.layout = 'public'` on the route): skip link, header with the navigation menu, the single
`<main id="main-content">`, and the footer. Views supply page content only and never add their own
`<main>`, skip link, navbar or footer; each settled view has exactly one `<h1>`. Login, register,
setup-password, the OAuth callback, `/dashboard` (its own `<main>`) and the admin shell are outside it.

- **Branding.** The header's institution and app names come from the public settings on every
  route, never from per-view defaults.
- **Navigation groups.** Beranda, then **Cerita**, **Sumber Daya** and **Tentang**, each a labelled
  list of plain links (not an application `role="menu"`); the current destination carries
  `aria-current="page"` and its group is marked. Cerita topics derive from the page hierarchy
  (`GET /api/pages`) in `sort_order`; if it has not loaded, fixed fallback links to the eight
  Cerita pages are shown instead. Sumber Daya holds Publikasi, Peta, Permintaan Data and Ketua RT;
  Tentang holds the three Tentang pages. Links to unregistered routes are omitted.
- **Account area.** One place, inside the menu, identical on every public page. Signed out: a single
  "Masuk" link. Signed in: email and role, the CMS entry the role may use (the first top-level
  `ADMIN_NAV` link the role is allowed, so Editor and Admin get the admin shell and a plain user gets
  none), and logout via the shared logout flow.
- **Menu behavior.** Below `md` it is a bounded right-anchored sheet (`min(88vw, 22rem)`, so a dimmed
  backdrop strip stays visible and tappable) exposed as a named modal dialog (`role="dialog"`,
  `aria-modal`, label "Menu navigasi"): focus moves in and is trapped, Escape / backdrop / close
  button dismiss it, focus returns to the toggle, the page behind and the header's logo and toggle
  are inert and body scroll is locked (ref-counted, so it never releases another overlay's lock).
  Escape is ignored while any other modal dialog is open in the document. From `md` it is an
  anchored navy panel with normal tab order; Escape and an outside click dismiss it. Following a link
  or any route change closes it (focus goes to the toggle if it was inside the panel). On a route
  path change after the first load, focus moves to `main#main-content` unless the user is typing in
  a field; query/hash-only changes do not move focus.
- **Header states.** The header has one height in every state. Foreground is always white; only the
  background changes. On Home (`meta.headerOverlay`) it overlays the hero: transparent (over a
  localized navy scrim) at the top with the menu closed, navy once scrolled past 64px or while the
  menu is open. Every other page is navy. State is re-read on load, scroll, resize, back/forward and
  route change, so a refresh at a scrolled position starts navy. Reduced motion makes transitions
  instant. The hero is full viewport height (`100dvh`, not reduced by the header) and reserves the header's height as top padding, and in-page anchors (hero, chapters,
  skip link target) clear it via `scroll-margin`.
- **Scroll and focus.** Public routes scroll the window to the top on a new path; back/forward
  restore the previous position, except between two entries of the same path that differ only by
  hash, which return to that hash target; a hash link (in-page anchor, chapter TOC, skip link)
  scrolls to its target below the sticky header, including repeat clicks on the same link and
  `/cerita/x#chapter` deep links once the chapters have rendered. Going back (or forward) to a Cerita URL lands
  on its hash target (or the top) rather than the earlier reading offset, with no second scroll, because the content loads
  asynchronously and the saved offset would be clamped to the short page. Query-only changes keep the
  position. Focus moves to
  `main#main-content` on a path change without scrolling. Admin routes scroll an inner container,
  which the admin shell resets to the top on a path change.
- **Breadcrumb.** Tentang/Sumber Daya breadcrumbs are a navy strip continuing the header and the navy
  hero panel (no white band between them); long labels wrap.
- **Cerita reader.** Every `/cerita/:slug` page opens with a navy title band (eyebrow "Cerita", the
  page title as the single `<h1>`, and the chapter count when there are chapters) and carries no
  introduction copy of its own: the page has none in data. The reader is always in exactly one state,
  decided per slug so one topic's outcome never shows on another and a late answer for a topic the
  reader has left is discarded:
  - **Loading**: a worded skeleton (`role="status"`, "Memuat halaman…") with no heading.
  - **Not found** (404): its own `<h1>` and a link back to Beranda.
  - **Failed** (any other failure, or a success without a page): an `<h1>`, the approved plain-language
    read message and a "Coba lagi" button; never a blank page.
  - **Ready**: chapters in order, each section showing its prose blocks in `sort_order`, its scalar
    figures with the backend-rendered comparison sentence (or hedged framing, §6) and source, and its
    matrix tables with `—` for missing cells and no bar for them.
  A chapter with nothing in it reads "Konten bab ini belum tersedia." (once, not per section); an empty
  section beside filled ones reads "Konten bagian ini belum tersedia."; a page with no content at all
  adds one note ("Belum ada konten yang dapat ditampilkan pada halaman ini.") so an empty seeded
  database looks intentional; a matrix table with no rows reads "Data tabel ini belum tersedia." and
  claims no period. A section whose figures or tables failed to load keeps what did load and shows its
  own alert with "Coba lagi" for that section only. If the shared prose request failed, one alert with
  a retry says the text could not be loaded and no section is called empty. Missing data is never drawn
  as a zero.
  Below `lg` the chapter selector is a navy bar that sticks directly under the header (its offset is
  `--public-header-height`) and opens its list below it; it stays inside the reader, so it never sits
  over the last paragraph or the footer. Escape, a selection, a press outside it or moving keyboard
  focus out of it closes it (Escape returns focus to the bar's button). From `lg` the selector is a
  sticky list beside the chapters. Chapter anchors and keyboard focus clear the header and, below
  `lg`, the selector. The current chapter follows scrolling (an observer band measured from the
  real header and selector heights, rebuilt on resize) and follows a `#chapter` deep link at once;
  deep links and Back/Forward behave as in "Scroll and focus" above.

**Landing page**, top to bottom:

1. Hero — institutional voice: what the site is and what it covers. Framed toward Manggar's general "potensi wilayah," not an explicit Bank Sampah callout even though the main potential is Bank Sampah. Mounted directly on top of the hero background image beneath the title and body text is the **Widget Cuaca** (frosted glassmorphic card presenting current conditions and next 2 forecast slots (about 3 hours apart) in Manggar from BMKG: condition description, temperature Celsius, humidity percent, wind speed, localized wind direction, accessible skeleton loading, error alert with retry button, and stale notice).
2. Sambutan Lurah — kept as a separate section, personal/welcoming voice, distinct from the
   hero's institutional voice.
3. Cerita preview — cards for the stat pages, each showing a few representative figures + link.
   Data-caveat/provenance handling is deferred to the full stat pages, not shown on the cards.

The former "Publikasi / Peta highlights" section was dropped from the landing page: Publikasi, Peta, and Ketua RT are publication-class artifacts that live on dedicated pages (`/publikasi`, `/peta`, `/ketua-rt`) reachable directly from navigation and footer (**Sumber Daya**), avoiding redundant highlight cards on the landing page.

SOTK and "who is the lurah" content is **not** on the landing page — it lives on the existing
"Tentang Kelurahan Manggar" page instead.

**Ketua RT page.** The `rt_leaders` table (§2, §7) gets its own dedicated page, treated as a
publication-class artifact — a peer of Publikasi and Peta, not a subsection of either. It is one
of the site's highest-utility artifacts (a resident looking up their own RT head), so it is not
buried inside a stat page. Entry points:

  Layout: the article (text, figures, charts) is the middle column, centred at a readable width
  regardless of the chapter list; from `xl` the chapter list is the right-hand column, from `lg` it is
  a fixed right track, and below `lg` it is the sticky selector bar. The title band has a "Kembali"
  link to the home page. The article template (`CeritaArticleTemplate`) renders a `CeritaArticle`
  (`types/ceritaArticle.ts`): a page holds chapters, a chapter holds sections, and a section has one
  heading, its paragraphs and optionally one figure. A figure is one photo, two photos (an offset
  pair), more than two (a swipeable row with Sebelumnya/Berikutnya buttons and a position label), or
  a diagram (title, picture or bars, source). Each chapter ends with a "Bab berikutnya" link; below
  `lg` the chapter bar sticks to the bottom of the reader and opens upward. Photos without a safe
  address, or that fail to load, are left out with their caption. Nothing in the backend produces a
  `CeritaArticle` yet; Wave 4 builds it from stored content. Until then the template runs only in
  development at `/cerita/contoh`, fed mockup text (`content/ceritaArticleDummy.ts`, one page) that is
  not sourced data and never shown to residents.
- Footer, under **Sumber Daya**.
- The interactive map — tapping an RT point opens that leader's contact card.
- Pemerintahan & Kelembagaan, chapter 2.3 (Pemerintahan Kelurahan), **links to** this page rather
  than duplicating the table, so the 100 rows have exactly one home.

The page provides **in-table search**: a single labelled text input filtering on both
`rt_number` and leader `name`, applied client-side over the full 100-row set (no server
round-trip). A digits-only query matches the RT number as a prefix and also matches names that
contain those digits, so `1` finds RT 1 and RT 10–19, while `007` still finds RT 7. The matching
rows are then **paginated client-side**, defaulting to **10 rows per page**, with a page-size
control (10/25/50/100 rows) and a bounded page-number list. Paging never costs a second request —
the page already asks for all 100 leaders in one call. The live region announces only the number
of matches ("Menampilkan N dari 100 RT"); the visible page range stays outside the live region so
paging does not re-announce the same count. Rows remain sorted by `rt_number` and the unfiltered
table is the default state. The `Alamat` column is automatically hidden when no leader in the
displayed dataset has an address value. A prominent sample-data notice follows the explicit
`maps.rt_leaders_sample_roster` flag, never a phone/name heuristic. No RT-range grouping or
collapsible bands — flat table only.

Operational roster entry is available in the CMS: manual editing of name, phone, WhatsApp flag,
address, and an optional pin placed on the map (click, drag, or keyboard buttons; no typed
coordinate fields; uses the same `LocationPicker` as the default map view, in pin mode), plus
CSV preview/apply for exact coordinates. CSV columns are
`rtNumber,name,phone,phoneIsWhatsapp,alamat,latitude,longitude`; blank cells preserve existing
values, omitted RTs are never deleted, and the whole import rolls back if any row is invalid.
Coordinates create or update the RT's 1:1 `ketua_rt` spatial point.

Public contact visibility: The Ketua RT page and Peta detail publish names, phone numbers, and
addresses. The API serves the same fields to both entry points; contact values remain empty until
an approved source provides them.

Accessibility implications, per `docs/ACCESSIBILITY.md`: the input needs a real `<label>` (not
placeholder-only), the result count belongs in an `aria-live="polite"` region, and the table
keeps proper `<caption>` / `<th scope>` semantics under filtering.

**Footer:**

- **Sumber Daya** — Publikasi (Prodeskel publications, infographics, Eco Boba booklet, etc.), Peta
  (interactive, QGIS-derived), Permintaan Data (in-app guide + timetable; PPID forms stay external),
  Ketua RT.
- **Cerita** — links to the Cerita-labeled pages. Confirmed: the 7 stat pages + Persampahan & Bank
  Sampah Unit.
- **Tentang** — Kelurahan Manggar, Program Desa/Kelurahan Cantik, Inovasi Sosial VYOMATANTRA.
- **Kolaborasi** — three logos: Desa Cantik/BPS, ITK, Tim Insos VYOMATANTRA; each logo links to the partner's official site (BPS at https://www.bps.go.id, ITK at https://itk.ac.id; opens in a new tab with rel="noopener noreferrer") or, for VYOMATANTRA, to its Tentang page (/tentang/vyomatantra).

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
| CMS Data & Konten             | `/data`                      |

`/tentang` redirects to `/tentang/kelurahan-manggar`.

**CMS Data & Konten (`/data`).** Accessible to users with `editor` or `admin` roles (`requiresEditor: true`).
Provides three tabbed operational interfaces:

1. **Indikator & Tabel**: Searchable and filterable list of all scalar indicators and matrix tables with modal editing forms (`ScalarIndicatorForm` and `TableIndicatorForm`).
2. **Blok Konten & Profil**: Direct editing of narrative content blocks (`landing-hero`, `landing-sambutan-lurah`, `landing-highlights`, `tentang-kelurahan-profil`, `publikasi-katalog`) through named forms (§4): collections are edited as repeatable rows, never as raw JSON, and each card states where residents see the block. `landing-highlights` stays editable but is labelled "Tidak ditampilkan di situs" because no public page reads it.
3. **Pengaturan Publik Portal** (admin only): a note and a link to Konfigurasi sistem (`/admin/sistem/konfigurasi`); no settings card, form or dialog. Editors do not see this tab.

**Konfigurasi sistem (`/admin/sistem/konfigurasi`).** The single Admin destination for system
settings (Editors are redirected, even by direct URL, and none of its calls are made). One page
with four sections, each a labelled `<h2>` with its own form, Save and result, plus section links
that move focus to the chosen heading:

- **Identitas dan kontak portal** and **Tampilan awal peta** (`PublicSettingsForm`, `part` identity /
  map): identity and contact fields; the default map view set with the shared `LocationPicker`
  ("Atur tampilan peta"), where panning and zooming the map, or its direction/zoom buttons and
  keyboard mode, define the centre and zoom and there is no numeric latitude, longitude or zoom
  entry. The API still validates latitude -90..90, longitude -180..180 and integer zoom 1..20. A
  form is shown only once the stored settings have loaded (never built on defaults); a failed load
  shows its message with a retry. Save stays disabled until something changed; "Batalkan perubahan"
  returns to the stored values; a failed save keeps the draft and shows approved wording.
- **Cuaca**: area name read-only (Manggar), the plain service status and last successful update (in
  WITA) from the public weather endpoint, and the three named refresh choices of §7.
- **Retensi log**: see §3.

Leaving the page (route change or closing the tab) with an unsaved edit in any section asks
"Perubahan belum disimpan" / "Tinggalkan halaman ini tanpa menyimpan perubahan?"; Escape, the
backdrop or "Tetap di sini" means stay. `/settings/audit-retention` redirects to the Retensi log
section behind the same Admin guards, so old bookmarks and links keep working.

**Dynamic View & Component Integration:**

- **`AppFooter`**: Dynamically reflects verified public contact numbers (`contactPhone`) and office address lines (`contactAddress`) from `settingsStore` when loaded, falling back gracefully to static defaults. The `/publikasi` link in the "Sumber Daya" navigation is always included to provide public access to municipal reports and booklets.
- **`InteractiveMap` & `PetaView`**: `PetaView` resolves `settingsStore.defaultCoordinates` once and passes the initial centre/zoom to `InteractiveMap`; the map applies a late settings change only before point framing or user interaction. The shared Manggar constant is only an offline fallback for the distance origin and the initial view. Behaviour of the page, including the location states, is in "Peta page" below.
- **`TentangKelurahanManggarView`**: Dynamically renders profile metrics (RT count, kecamatan, kota), administrative boundaries, and SOTK officials from the `tentang-kelurahan-profil` content block, falling back to verified constants in `content/tentang.ts`.
- **`PublikasiView`**: Dynamically renders publication entries from the `publikasi-katalog` content block, falling back to `content/publikasi.ts` when metadata is absent or uninitialized. An explicitly saved empty array (`publications: []`) renders an empty catalog state rather than restoring the defaults (settled D2). Each item optionally carries short `fileType` (e.g. PDF, XLSX) and `fileSizeBytes` metadata rendered alongside verified direct download actions, while unreleased items display the honest "Segera hadir" status.

**Peta page (`/peta`).**

- **Layout.** One toolbar holds the heading, the result count and the "Rincian data" disclosure (RT with coordinates, integrity conflicts and the per-type breakdown; an in-flow disclosure below `md`, a floating panel from `md`). Counts always say what they cover: "Menampilkan semua N titik" with no search or filter, "Menampilkan X dari N titik sesuai pencarian atau filter" otherwise; the list count repeats the same distinction. Reading order is search and filters, map, results. From `lg` the map sits beside the controls and the list; between `md` and `lg` they stack; below `md` the map comes first and the results are one panel directly under it.
- **Results panel.** There is exactly one results panel, with two modes: the nearest-first list, or the detail of the selected point (marker or list selection opens it). Below `md` it is collapsed until a labelled button ("Lihat daftar hasil (N)" / "Lihat detail titik", "Sembunyikan …") opens it; the button carries `aria-expanded` and `aria-controls`, and Escape in the open list collapses it and returns focus to the button. The panel sits under the map, never over it, so the zoom buttons and attribution are never covered; opening or closing it re-measures the map (`invalidateSize`) without changing the view. Opening the navigation menu (the page becomes `inert`) puts the panel away. Marker selection, clusters, framing, filters, pagination focus hand-off, integrity warnings and the Ketua RT reciprocal link are unchanged. Leaflet stays inside its local stacking boundary (the map root is `isolate z-0`).
- **Visitor location.** One session-wide, deduplicated request (`composables/useGeolocation.ts`), held in memory only: never written to storage, sent to the server, shown in the CMS or reported anywhere, and reused when the visitor returns to the map within the session. States: `idle`, `checking`, `prompt`, `granted-locating`, `located`, `denied`, `unsupported`, `timeout`, `unavailable`, `insecure`. On entering the map the saved browser permission is read (Permissions API where available): already granted starts one bounded request (10 s timeout, cached fix at most 60 s old); undecided, or unreadable, shows a prominent explanation and an "Aktifkan lokasi" button and asks nothing until it is pressed; denied explains the browser setting and never asks again; an unsupported browser or an insecure (non-HTTPS) page is explained. A timeout or an unavailable position offers one "Coba lagi". If the visitor later changes the browser setting, the page follows it. Late answers after the visitor chose "Pakai pusat kelurahan" or left the page are ignored. A fix obtained automatically never moves the map; a button press centres the map on the fix only when the visitor has not moved the map since pressing it. A location failure never blocks browsing the map or the list.
- **Distance origin.** Every distance names its origin: "Jarak dari lokasi Anda" with a held fix, otherwise "Jarak dari pusat kelurahan" (the CMS default coordinates, then the shared constant). Each row's distance carries the origin for screen readers.

The `/permintaan-data` guide cites UU 14/2008 Pasal 22 ayat (7)–(8) for the 10+7 working-day
PPID reply window, Pasal 35 ayat (1) and Pasal 36 for the objection windows, and Pasal 37–38
with PerKI No. 1/2013 Pasal 13 for disputes. The local PPID SOP is a procedure reference, not a
substitute for the statute.

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

**Admin base layout shell.** Every admin/CMS route (`/admin`, `/data`, `/users`, `/audit-logs`,
and the `/admin/*` destinations named below) is mounted
inside one shared layout (`AdminLayout.vue`): a collapsible sidebar, a header showing the page
title and a one-line subtitle the view supplies, and a breadcrumb. Shell access requires Editor or
Admin; individual routes still layer their own `requiresAdmin` guard where SPEC §3 restricts them
to Admin. The sidebar lists Beranda, Data, Cerita, Peta, Publikasi, Rukun Tetangga, and an
Admin-only **Sistem** group (Akun pengguna, Templat kalimat, Konfigurasi sistem, Log sistem).
Visibility is driven by a single role-to-items map (`frontend/src/config/adminNav.ts`) that the
route guards also read from, so the sidebar and the guards cannot disagree about who can reach a
given page — a resource a role isn't authorized for is absent from the sidebar entirely, not
merely disabled. Cerita is not built yet; its sidebar entry carries a
"Segera hadir" badge and opens a minimal placeholder view rather than being hidden. Rukun Tetangga,
Konfigurasi sistem (above), Templat kalimat (§5) and Peta (below) open their real management views;
Publikasi still opens a placeholder.

**Peta management (`/admin/peta`).** Editor and Admin manage map points (`spatial_points`, §7) on
the existing maps API and the shared `LocationPicker`. Nothing on this screen shows or accepts
latitude, longitude, zoom, a point id or a metadata field.

- **Layout.** From 1280px the point list and the map sit side by side; below that a "Daftar" /
  "Peta" switch shows one at a time. The list is the keyboard and screen-reader path to every point
  (10 per page, with the pagination focus hand-off of `docs/ACCESSIBILITY.md` §4); the map is
  `InteractiveMap` and selecting a marker or a row highlights the other and opens a detail panel
  with the same Ubah / Hapus actions. Search matches name or RT number (digits match an RT number by
  prefix, as on the Ketua RT page); the type filter offers the real point types (Ketua RT, Bank
  Sampah, Fasilitas Umum). The result count is a live region and says whether it covers all points
  or a filtered subset.
- **Create / edit.** Fields: name (1–191 characters), type, position (`LocationPicker`, pin mode,
  required) and RT coverage chosen from a grid of RT 1–100 (never typed): a native radio group for
  Ketua RT, checkboxes for Bank Sampah and Fasilitas Umum. A new Ketua RT point's name defaults to
  "Pos RT NN Kelurahan Manggar" until the editor types one. An edit sends only the changed fields.
  Existing `metadata` is never read or sent by this screen, so it is preserved.
- **Invariants (§7), worded for the editor.** A Ketua RT point covers exactly one RT; an RT has at
  most one Ketua RT point (the picker marks RTs that already have one and the form explains the
  clash before any request); a Bank Sampah or Fasilitas Umum point may cover any number of RTs,
  including ones that have a Ketua RT point. As on the server, the coverage rules are applied only
  when the type or coverage changes, so an unrelated edit of a legacy point is not blocked. A point
  whose stored coverage breaks a rule is listed with "Perlu diperbaiki", the specific problem and
  what to do, and the list can be narrowed to those points. The wording is derived from the points,
  not from the server's technical `integrityWarning`.
- **Concurrency.** A save or delete of a Ketua RT point that owns exactly one RT carries
  `expectedRtNumber`; other points send none. On `409 STALE_WRITE` or `404` the editor keeps the
  whole draft, reloads the points, and refuses to save until the editor presses "Muat ulang titik",
  which replaces the draft with the saved version (or closes with a notice if the point is gone). A
  stale or already-deleted delete closes the confirmation and reloads, so the editor re-opens Hapus
  from fresh data. A duplicate-Ketua-RT `409` is explained in plain words, and the server's sentence
  (which names internal ids) is never shown.
- **Delete.** The confirmation names the point and its type and says it cannot be undone; for a
  Ketua RT point it also says the Ketua RT's name and phone are not deleted. Deleting a seeded
  Ketua RT point still tombstones it server-side (§2).
- **Boundaries.** Ketua RT name, phone and address stay in `/admin/rukun-tetangga`, which this screen
  links to; a point never carries a second contact field. The sample-roster flag is Admin-only and
  lives there; point edits never change it. After every create, edit or delete the shared maps
  store (points and summary) and the Ketua RT roster are reloaded, so the public map and the Ketua
  RT page show the change without waiting for their caches.

## 9. Explicitly Out of Scope

- **Budget/finance (APBDes) surfacing** — dropped entirely; the kelurahan has no APBDes. Note that
  Tabel 2.5.2 of "Kelurahan Manggar Dalam Angka 2026" is not a substitute: it holds
  accountability/oversight counts (LKPJ submissions, kinerja reports, jumlah supervisi/diklat,
  jumlah kasus pengaduan), not budget content.
- **UMKM curation** — not included.
- **Guestbook** — excluded.
- **PPID document hosting** — never; forms stay on the official PPID site; SIDATA only explains and links (§1).
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

- **Cerita article content model (Wave 4):** how editors author a section's figure (photos with
  caption, credit and alt text; diagrams), an editorial headline and a byline, and how they are
  stored against sections. A byline names
  authorship, so it needs an approved source before it is published.
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
