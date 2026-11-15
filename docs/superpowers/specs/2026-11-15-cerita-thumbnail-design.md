# Design: Editable Cerita Thumbnail with Modular Desktop-Proportion Cropper

Date: 2026-11-15
Branch: `feat/cerita-thumbnail-change`

## 1. Intent & Why

Each Cerita page displays a thumbnail on the `/admin/cerita` page card (the rightmost image) and a full-bleed background banner in the Cerita preview section of the homepage (`HomeView.vue` -> `StatOverview`). Today those images are hardcoded in `frontend/src/content/ceritaCovers.ts` (`CERITA_COVERS`) keyed by the 8 seeded slugs, so editors cannot change them and newly created Cerita pages have no cover image at all.

Because uploaded source photos can have any aspect ratio or shape (square, portrait, ultra-wide, circular badge, etc.), editors also need an interactive crop-and-resize step before saving, framed to the homepage desktop banner proportion (`1851 × 731`, ~`2.53:1`) while staying modular and unbroken across ultra-widescreen, mobile, and admin card layouts.

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Allow Editors and Admins to upload, crop/frame/resize, replace, and remove the thumbnail/cover image of any Cerita page from `/admin/cerita`.
- Reflect the stored image immediately on `/admin/cerita` page cards and on the public homepage Cerita preview (`HomeView.vue`).
- Provide a modular, dependency-free client-side cropper modal reusable for other landscape banner/cover slots later (configurable `aspectRatio` and output dimensions, defaulting to `1851 / 731`).
- Keep images visually unbroken (no stretching, clipping distortion, or key subject loss) across desktop (`1851 × 731`), ultra-widescreen, mobile, and the narrow `w-56` admin card thumbnail.
- Adhere to SIDATA's media storage, optimistic concurrency (`expectedUpdatedAt`), transaction locking, audit trail, Indonesian error messaging, and WCAG 2.1 Level A accessibility rules.

### Non-Goals
- Turning `HomeView.vue`'s `CERITA_CATEGORIES` list itself into a fully dynamic page directory (adding/removing homepage preview categories is out of scope; `HomeView.vue` continues rendering the 8 Cerita preview categories while resolving each category's background image dynamically from `pagesStore` with `CERITA_COVERS` fallback).
- Freeform rotation, filters, or multi-image galleries on a page cover.
- Server-side non-uniform crop coordinate storage (`x, y, w, h` re-cropping after upload).

### Anti-Goals
- Rendering a bare `<img src="/api/media/<id>/preview">` on admin cards (violates the authenticated preview contract; must use `useAuthenticatedBlobUrl`).
- Bypassing `media_assets` / `attachMedia` / `detachMedia` or storing raw base64 data URLs in `pages`.
- Allowing unattached uploads to leak indefinitely or skipping `detachMedia` on page deletion.

## 3. Constraints

- **Database:** MySQL via `@prisma/adapter-mariadb`. New columns/tables must keep `backend/scripts/grants/audit-logs-grants.sql` valid (no new table is added here; `pages`, `media_assets`, `media_asset_references`, `audit_logs` are already granted).
- **Media pipeline (`backend/src/utils/mediaPolicy.ts` & `mediaImage.ts`):** Max input upload `5 MiB` (`PHOTO_MAX_BYTES`), accepted signatures JPEG/PNG/WebP, re-encoded server-side to WebP (max `2560px` long edge) plus a `320px` WebP thumbnail derivative.
- **Public vs Admin media routes:** Public homepage uses `/api/media/<id>` (only serves assets with `attached_at IS NOT NULL`); admin card uses `/api/media/<id>/preview?variant=thumbnail` via `apiFetch` -> `URL.createObjectURL`.
- **Concurrency & Audit:** Every `Page` mutation checks `expectedUpdatedAt`, locks the `Page` row (`SELECT ... FOR UPDATE`) and any touched `MediaAsset` rows in ascending ID order inside `executeLockedTransaction`, and writes an `audit_logs` row in the same transaction without logging file names, storage keys, or PII.
- **Frontend errors & accessibility:** Plain Indonesian 400 messages (no field names or English defaults), `AlertBanner` with `errorKind`, `BaseModal` focus trap/restore, keyboard-operable crop controls, and semantic HTML.

## 4. Approaches Considered

1. **Approach 1 — Client-side `<canvas>` crop/zoom modal + existing `media.service` pipeline *(Selected)***
   - Reusable `<canvas>` cropper modal locked to target aspect ratio (`1851 / 731`), pan/zoom via pointer drag, slider, and keyboard arrows/`+`/`-`, exporting cropped WebP/PNG to `uploadMedia(file, 'cerita-cover')`, saved via `PUT/DELETE /api/pages/:slug/cover`.
   - *Why selected:* Zero new runtime dependencies, complete WCAG keyboard control, and the cropped rectangular asset itself is persisted and re-encoded by the existing security boundary.
2. **Approach 2 — Third-party cropper package (e.g., `cropperjs`)**
   - *Rejected:* Adds supply-chain dependency, bundle weight, Tailwind v4 CSS integration friction, and uncertain keyboard/screen-reader behavior for a single aspect-locked frame.
3. **Approach 3 — Upload raw photo + server-side crop coordinates**
   - *Rejected:* Complicates `media.service.ts` / `mediaImage.ts` with custom server crop APIs or CSS hacks when editors only need a crop-before-post flow.

## 5. Architecture & Detailed Design

### 5.1 Database & Media Policy (`backend/`)
- **Prisma schema (`backend/prisma/schema.prisma`):**
  - Add `coverAssetId String? @map("cover_asset_id")` on `Page` (nullable UUID). No cascade relation needed because `MediaAssetReference` (`referenceType: 'page'`, `referenceId: page.id`, `slot: 'cover'`) and `attachMedia`/`detachMedia` enforce asset attachment lifecycle (`onDelete: Restrict` on `MediaAssetReference`).
  - Migration adds nullable `cover_asset_id VARCHAR(191) NULL` on `pages` (plus index if helpful, e.g. `@@index([coverAssetId])`).
- **Media policy (`backend/src/utils/mediaPolicy.ts` & `frontend/src/services/media.service.ts`):**
  - Add `'cerita-cover': { kinds: ['photo'], owner: { type: 'uploader' } }` to `MEDIA_PURPOSES` (and frontend `MediaPurpose` / `MEDIA_PURPOSE_KINDS`).
- **Audit actions (`backend/src/services/audit.service.ts`):**
  - Add `PAGE_COVER_UPDATED: defineAction('page.cover_updated', 'info')` and `PAGE_COVER_DELETED: defineAction('page.cover_deleted', 'warning')`.
  - Metadata records `{ slug, hasCover: true/false }` only — never filenames or storage paths.

### 5.2 Backend API & Service (`backend/src/services/pages.service.ts`, `pages.controller.ts`, `pages.routes.ts`)
- **DTOs:**
  - Include `coverAssetId: string | null` on `PageSummaryDTO`, `PageDetailDTO`, and `PageAuthoringDTO` so `GET /api/pages`, `GET /api/pages?include=sections`, `GET /api/pages/:slug`, and authoring mutations all carry it.
- **Endpoints (Editor or Admin, `apiLimiter`, `verifyToken`, `requireEditorOrAdmin`, `pagesWriteLimiter`, CSRF-protected):**
  - `PUT /api/pages/:slug/cover`: body `{ coverAssetId: string (uuid), expectedUpdatedAt: string }`.
    - Inside `executeLockedTransaction`:
      1. Lock `Page` row by slug (`FOR UPDATE`); verify existence (404) and `assertFresh` (409).
      2. Lock touched `MediaAsset` IDs (old `existing.coverAssetId` if present and different, plus new `coverAssetId`) in ascending ID order (`FOR UPDATE`).
      3. No-op check: if `existing.coverAssetId === input.coverAssetId`, re-assert `attachMedia` (ensuring `attached_at` and reference stay intact) and return `withChangeResult(toPageAuthoring(existing), false)`.
      4. Call `attachMedia(tx, [input.coverAssetId], { purpose: 'cerita-cover', reference: { type: 'page', id: existing.id, slot: 'cover' } })`.
      5. If `existing.coverAssetId` was set, call `detachMedia(tx, [existing.coverAssetId], { purpose: 'cerita-cover', reference: { type: 'page', id: existing.id, slot: 'cover' } })`.
      6. Update `page.coverAssetId = input.coverAssetId` (bumping `updatedAt`), write `PAGE_COVER_UPDATED` audit log, return `PageAuthoringDTO`.
  - `DELETE /api/pages/:slug/cover?expectedUpdatedAt=...`:
    - Locks `Page` row (`FOR UPDATE`), checks `assertFresh`.
    - If `existing.coverAssetId` is already `null`, returns `withChangeResult(toPageAuthoring(existing), false)`.
    - Otherwise locks `[existing.coverAssetId]` (`FOR UPDATE`), calls `detachMedia`, sets `coverAssetId: null`, writes `PAGE_COVER_DELETED` audit log, and returns `PageAuthoringDTO`.
- **Page deletion cleanup (`deletePage` in `pages.service.ts`):**
  - Before `tx.page.delete`, if `existingPage.coverAssetId` is non-null, lock and `detachMedia` the asset (`reference: { type: 'page', id: existingPage.id, slot: 'cover' }`) inside the same transaction so `MediaAssetReference` (`onDelete: Restrict`) does not leave an orphan attached asset.

### 5.3 Modular Client-Side Cropper (`frontend/src/components/common/ImageCropModal.vue` + `frontend/src/utils/imageCrop.ts`)
- **Pure math helper (`utils/imageCrop.ts`):**
  - Given natural image dimensions `(natW, natH)`, target aspect ratio (`1851 / 731`), `zoom >= 1`, and pan offset `(panX, panY)` normalized/clamped so the image always covers the crop frame (no transparent bars or dead space regardless of input aspect ratio — portrait, square, circular, or ultra-wide):
    - Computes minimum cover scale, clamped pan bounds, source rectangle `(sx, sy, sw, sh)`, and canvas export dimensions capped at `targetWidth × targetHeight` (default `1851 × 731`, scaling down proportionally if source is smaller so we don't upscale tiny images unnecessarily, or exporting at `Math.min(targetWidth, Math.round(sw))` preserving exact `1851:731` aspect ratio).
- **Reusable component (`components/common/ImageCropModal.vue`):**
  - Props: `open`, `title`, `description`, `aspectRatio` (default `1851 / 731`), `targetWidth` (default `1851`), `targetHeight` (default `731`), `safeZoneAspectRatio` (optional, e.g., `16 / 9` or `4 / 3` guide showing the center area preserved on narrower screens/cards), `currentPreviewUrl` (optional), `hasCustomImage` (boolean), `busy`, `error`, `errorKind`, `stale`.
  - Features:
    - File picker (`PHOTO_ACCEPT`) + drag-and-drop validated via `validatePhotoFile`.
    - Interactive `<canvas>` stage locked to `aspectRatio` with pointer drag to pan, zoom slider (`1×` to `4×`), `+`/`-` zoom buttons, "Pusatkan ulang" (reset) button, and keyboard navigation when the canvas stage is focused (Arrow keys pan, `+`/`-` zoom).
    - Faint overlay guide inside the frame indicating the center safe zone so editors keep key subjects centered across desktop (`1851 × 731`), ultra-widescreen, mobile, and the `w-56` admin card.
    - Exports cropped canvas to WebP (`image/webp`, quality `0.9` with PNG fallback if browser lacks WebP canvas encode) as a `File`, emits `save(file)` (parent uploads via `uploadMedia` and attaches) and `remove()` (clears custom cover), plus `reload()` on 409 stale write.

### 5.4 Admin Cerita Integration (`frontend/src/components/admin/cerita/` & `AdminCeritaView.vue`)
- **Entry points:**
  - Add a "Thumbnail" / "Ubah thumbnail" `CardActionButton` (`PhotoIcon`) on `CeritaPageCard.vue` action bar, AND a matching button in `CeritaStructurePanel.vue` header next to "Judul utama & penulis" so editors can change it from either view.
- **`CeritaThumbnailDialog.vue`:**
  - Thin wrapper around `ImageCropModal.vue` wired to `aspectRatio = 1851 / 731`, `targetWidth = 1851`, `targetHeight = 731`, showing the current cover (authenticated blob URL if `page.coverAssetId` is set, or `ceritaCoverFor(page.slug)` fallback preview) and handling the two-step save (`uploadMedia(file, 'cerita-cover')` -> `store.updatePageCover(slug, assetId, token)`) plus `store.deletePageCover(slug, token)` and 409 stale-write reload.
- **`CeritaPageCard.vue` thumbnail rendering:**
  - If `page.coverAssetId` is set: lazily fetch `${mediaPreviewPath(page.coverAssetId)}?variant=thumbnail` with `useAuthenticatedBlobUrl` (matching `PublikasiCard.vue` with `IntersectionObserver`) and render `<img :src="blobUrl" class="... object-cover object-center" />`.
  - Else: render `ceritaCoverFor(page.slug)` if present, or the `BookOpenIcon` placeholder.

### 5.5 Public Homepage Integration & Cross-Viewport Modularity (`frontend/src/views/HomeView.vue` & `StatOverview.vue`)
- **`HomeView.vue`:**
  - Read `pagesStore.pages` (already fetched by `PublicLayout.vue`). Build a slug -> `coverAssetId` map so each item in `CERITA_CATEGORIES` resolves `bgImage`:
    - If matching page has `coverAssetId`: `/api/media/${coverAssetId}` (public full-res `2560px`-bounded WebP served via `GET /api/media/:id`).
    - Else: fallback to `CERITA_COVERS[category.slug]`.
- **Cross-viewport unbroken display:**
  - Because `StatOverview.vue` renders `background-size: cover; background-position: center` and `CeritaPageCard.vue` renders `object-cover object-center`, a cropped `1851:731` asset scales proportionally without distortion on desktop, ultra-widescreen, and phone viewports, keeping the editor's center-framed subject visible everywhere.
  - Note in `StatOverview.vue`: wrap `url("${bgImage}")` safely (already safe for `/api/media/<uuid>` and bundled Vite asset URLs).

## 6. Calls Made & Open Notes for Builder

- **Builder call — Dedicated `PUT/DELETE /api/pages/:slug/cover` endpoints:** Chosen over stuffing `coverAssetId` into `PATCH /api/pages/:slug` to mirror `PUT/DELETE /api/sections/:id/figure` (`sectionFigure.service.ts`), keeping text updates and media attachment locking cleanly separated.
- **Builder call — No upscaling on small uploads:** When the cropped region of a user-supplied image is narrower than `1851px`, export at `Math.min(1851, Math.round(sourceCropWidth))` with matching `1851:731` height rather than upscaling blurry pixels; CSS `background-size: cover` scales it cleanly on display.
- **Builder call — Safe-zone guide ratio:** Use a subtle center-50% / `4:3` safe-zone dashed outline inside `ImageCropModal.vue` so editors know what stays visible on narrow phone screens and `w-56` admin cards.
- **Docs sync (per `AGENTS.md`):** Update `docs/SPEC.md` (§2/§3/§7/§8) and `docs/ARCHITECTURE.md` in the same PR.
