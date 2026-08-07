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

## 3. Roles

| Role   | Can do                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor | Edit data figures and prose; manage the Cerita page list (add/remove/reorder pages); edit Sambutan Lurah                                     |
| Admin  | Everything Editor can, plus user/role management and authoring new phrase-structure templates for the computed-comparison prose builder (§5) |

No third role (e.g. viewer/approver) is defined. No periodic-review role exists — see §6.

## 4. Data Entry

Hybrid model:

- **Scalar indicator figures** — bulk XLS import, falling back to manual entry (see §10).
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
`RefreshToken` tables in `schema.prisma` are the auth layer, already implemented, and distinct
from the tables below.)

This section is design intent expressed in raw-DDL vocabulary (`ENUM`, `CHECK`, snake_case table
names); none of these 10 tables exist yet. Translate into `backend/prisma/schema.prisma` models
with `@@map` when implementing.

| Table                                       | Purpose / key design notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`, `chapters`, `sections`             | Hierarchy per §2. No 1:1 constraint between chapter and section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `indicators`                                | Scalar figures. `value_current` / `value_previous` (nullable — null `value_previous` mechanically gates the tier-1 prose builder), `period_current` / `period_previous`, `is_computed_comparison`, `is_stale` (flags June 2024 Potensi fields), `source`, `hedge_note`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `indicator_tables` + `indicator_table_rows` | Normalized rows (not a JSON blob) for the 4 fixed-shape matrix tables — cells need to be queryable/computable. Manual entry only (§4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `spatial_points`                            | Ketua RT and Bank Sampah unit point records (~100, manual field survey). `type` ENUM, lat/lng, `metadata` JSON (MySQL has no JSONB). Feeds the interactive map, which is also an entry point to the Ketua RT page (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `spatial_point_rt`                          | Junction table (`point_id`, `rt_number`). Needed because Ketua RT points are always 1:1 with an RT, but a Bank Sampah unit can cover multiple RTs (e.g. one unit serving RT 30/72/60) — a flat `rt_number` column on `spatial_points` would be lossy.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `content_blocks`                            | Prose/narrative content. `section_id` nullable (populated for normal Cerita/stat-page prose tied to the hierarchy; null for standalone blocks like hero, Sambutan Lurah, landing highlights). `block_type` ENUM, `slug` (stable lookup key), `body` TEXT (tier-2 free text). `sort_order INT NULL` with `CHECK (section_id IS NOT NULL OR sort_order IS NULL)` — ordering only means something within a section; standalone blocks are unique named slots with no siblings to sort against.                                                                                                                                                                                      |
| `rt_leaders`                                | Single table, 100 rows (one per RT — not per-RT pages). `rt_number`, `name`, `phone`, `phone_is_whatsapp BOOLEAN` (some numbers aren't WhatsApp-registered — determines tap-to-chat vs. call-only rendering), `alamat` nullable (some addresses genuinely missing). No lat/lng column — coordinates are reached by joining `rt_leaders.rt_number` → `spatial_point_rt.rt_number` → `spatial_points.id`, filtered on `spatial_points.type` (required, not optional: a Bank Sampah unit covering RT 30/72/60 means `rt_number` is not unique in `spatial_point_rt`, so an unfiltered join also returns Bank Sampah points). Avoids duplicating/drifting lat-lng across two tables. |

No indicator-citation-tracking table exists. Cerita-page data citations (e.g. the Bank Sampah
page citing Ekonomi & Ketertiban figures) stay informal/manual in prose text, not structurally
linked.

## 8. Site Structure

**Landing page**, top to bottom:

1. Hero — institutional voice: what the site is and what it covers. Framed toward Manggar's general "potensi wilayah," not an explicit Bank Sampah callout even though the main potential is Bank Sampah.
2. Sambutan Lurah — kept as a separate section, personal/welcoming voice, distinct from the
   hero's institutional voice.
3. Cerita preview — cards for the stat pages, each showing a few representative figures + link.
   Data-caveat/provenance handling is deferred to the full stat pages, not shown on the cards.
4. Publikasi / Peta highlights — includes the interactive map.

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

## 10. Open Items

Single register — unresolved questions live here and nowhere else.

- Whether the Prodeskel app can export XLS, which the bulk-import path in §4 depends on. If not,
  scalar figures fall back to manual entry.
- Whether the Ketua RT page (§8) needs in-table search/filter, given 100 rows to scan.
