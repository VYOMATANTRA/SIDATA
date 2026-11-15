# Cerita Thumbnail Change & Modular Cropper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Editors and Admins crop, resize, upload, replace, and remove the thumbnail/cover image of any Cerita page from `/admin/cerita` — framed to the homepage desktop proportion (`1851 × 731`) — and reflect it immediately on admin cards and the public homepage.

**Architecture:** Add a nullable `cover_asset_id` column on `pages` backed by the existing `media_assets` / `media_asset_references` lifecycle (`attachMedia` / `detachMedia`) via `PUT` and `DELETE /api/pages/:slug/cover`. On the frontend, build a dependency-free, reusable `<canvas>` crop/zoom modal (`ImageCropModal.vue` + pure `imageCrop.ts` math) locked to `1851 / 731` with a center safe-zone guide so cropped photos scale cleanly via `cover` + `center` across desktop, ultra-widescreen, mobile, and the `w-56` admin card.

**Tech Stack:** Prisma 7 + `@prisma/adapter-mariadb` (MySQL), Express + Zod, Node test runner (`tsx`), Vue 3 `<script setup>` + Pinia + Tailwind CSS v4, Vitest + `@vue/test-utils`.

**Spec:** [`docs/superpowers/specs/2026-11-15-cerita-thumbnail-design.md`](../specs/2026-11-15-cerita-thumbnail-design.md)

## Global Constraints

- Database engine is MySQL via `@prisma/adapter-mariadb`; no new tables are added (only `pages.cover_asset_id`).
- Media upload limits stay centralized in `backend/src/utils/mediaPolicy.ts` (`PHOTO_MAX_BYTES = 5 MiB`, `PHOTO_MAX_LONG_EDGE_PX = 2560`, `PHOTO_THUMBNAIL_LONG_EDGE_PX = 320`).
- Admin previews MUST be fetched with `apiFetch` (`Authorization: Bearer`) and rendered via `useAuthenticatedBlobUrl`; never a bare `<img src="/api/media/.../preview">`. Public homepage uses `/api/media/<id>`.
- Every `Page` write checks `expectedUpdatedAt`, locks `Page` then `MediaAsset` rows in ascending ID order inside `executeLockedTransaction` (`ReadCommitted` for `detachMedia`), and logs to `audit_logs` in the same transaction without filenames or paths.
- Backend 400 messages shown to operators must be plain Indonesian without API field names; `coverAssetId` must be added to `HIDDEN_API_TOKENS` in `frontend/src/utils/userMessages.ts`.
- Admin error banners use `AlertBanner.vue` with `errorKind`; modals use `BaseModal.vue`; markup conforms to WCAG 2.1 Level A (`docs/ACCESSIBILITY.md`).
- Zero new npm runtime dependencies; client crop/resize uses native `<canvas>`.

## Review Focus

1. **Small or non-rectangular source image (e.g. `400×400` avatar or transparent PNG):** Export width caps at `Math.min(targetWidth, Math.round(cropSourceWidth))` with matching `1851:731` height (never upscaling blurry pixels) and fills opaque canvas backing before export so transparent PNG edges don't render awkwardly.
2. **Extreme pan/drag on tall portrait or ultra-wide images:** `clampPan` in `imageCrop.ts` strictly keeps the scaled image covering 100% of the `1851:731` frame so blank margins can never appear inside the crop.
3. **Concurrent edit (`409 STALE_WRITE`) while the crop/thumbnail dialog is open:** `CeritaThumbnailDialog.vue` keeps the user's cropped preview/draft intact, shows the stale reload banner ("Muat versi terbaru"), and updates `token` on reload without dropping the cropped file.
4. **Replacing or deleting when the previously stored `coverAssetId` was already detached/missing:** `putPageCover`, `deletePageCover`, and `deletePage` pass `{ lenient: true }` to `detachMedia` for the *old* asset so a missing legacy asset never deadlocks or blocks updating/deleting a page.
5. **Cross-viewport display (`2560px` ultra-wide, `1851×731` desktop, `375px` mobile, `w-56` admin card):** Both `StatOverview.vue` (`backgroundSize: 'cover'`, `backgroundPosition: 'center'`) and `CeritaPageCard.vue` (`object-cover object-center`) preserve aspect ratio around the center safe-zone without distortion or overflow.

---

## File Structure

| File | Role |
| --- | --- |
| `backend/prisma/schema.prisma` | Add `coverAssetId String? @map("cover_asset_id")` + index on `Page` |
| `backend/prisma/migrations/<ts>_add_page_cover_asset/migration.sql` | MySQL migration adding `cover_asset_id` |
| `backend/src/utils/mediaPolicy.ts` | Add `'cerita-cover'` purpose (`kinds: ['photo']`, `owner: { type: 'uploader' }`) |
| `backend/src/services/audit.service.ts` | Add `PAGE_COVER_UPDATED` and `PAGE_COVER_DELETED` |
| `backend/src/services/pages.service.ts` | Expose `coverAssetId` on DTOs; implement `putPageCover`, `deletePageCover`, and `deletePage` cover detach |
| `backend/src/controllers/pages.controller.ts` | Add `putPageCoverHandler` and `deletePageCoverHandler` |
| `backend/src/routes/pages.routes.ts` | Mount `PUT /:slug/cover` and `DELETE /:slug/cover` |
| `frontend/src/utils/imageCrop.ts` | Pure aspect-locked cover math, pan clamping, safe-zone rect, canvas crop export |
| `frontend/src/components/common/ImageCropModal.vue` | Reusable accessible `<canvas>` crop/zoom modal |
| `frontend/src/services/media.service.ts` | Add `'cerita-cover'` to `MediaPurpose` & `MEDIA_PURPOSE_KINDS` |
| `frontend/src/utils/userMessages.ts` | Add `'coverAssetId'` to `HIDDEN_API_TOKENS` |
| `frontend/src/stores/pages.store.ts` | Carry `coverAssetId` on `PageSummary`, `PageDetail`, `HierarchyPage` |
| `frontend/src/services/ceritaAdmin.service.ts` | Add `putPageCover` and `deletePageCover` API calls |
| `frontend/src/stores/ceritaAdmin.store.ts` | Add `updatePageCover` and `deletePageCover` actions |
| `frontend/src/components/admin/cerita/ceritaDomIds.ts` | Add `cardThumbnail(slug)` and `pageThumbnail` DOM IDs |
| `frontend/src/components/admin/cerita/CeritaThumbnailDialog.vue` | Cerita-specific wrapper over `ImageCropModal` (`1851/731`, upload + attach/remove) |
| `frontend/src/components/admin/cerita/CeritaPageCard.vue` | Lazy `useAuthenticatedBlobUrl` preview + `Thumbnail` action button |
| `frontend/src/components/admin/cerita/CeritaStructurePanel.vue` | Add `Ubah thumbnail` button in page header |
| `frontend/src/views/AdminCeritaView.vue` | Wire `CeritaThumbnailDialog`, list/detail triggers, and focus handback |
| `frontend/src/views/HomeView.vue` | Resolve category `bgImage` from `pagesStore.pages` (`coverAssetId`) with `CERITA_COVERS` fallback |
| `frontend/src/components/common/StatOverview.vue` | Quote CSS `url("${props.bgImage}")` cleanly |
| `docs/SPEC.md` & `docs/ARCHITECTURE.md` | Document `pages.cover_asset_id`, `cerita-cover`, endpoints, and new components |

---

### Task 1: Schema, Migration, Media Policy & Audit Actions

**Files:**
- Modify: `backend/prisma/schema.prisma:205-222`
- Create: `backend/prisma/migrations/<timestamp>_add_page_cover_asset/migration.sql`
- Modify: `backend/src/utils/mediaPolicy.ts:123-131`
- Modify: `backend/src/services/audit.service.ts:57-61`
- Test: `backend/src/__tests__/mediaPolicy.cover.test.ts`

**Interfaces:**
- Produces:
  - `Page.coverAssetId: string | null` in Prisma client (`cover_asset_id`)
  - `MEDIA_PURPOSES['cerita-cover']` (`kinds: ['photo']`, `owner: { type: 'uploader' }`)
  - `AUDIT_ACTIONS.PAGE_COVER_UPDATED` (`'page.cover_updated'`, `'info'`)
  - `AUDIT_ACTIONS.PAGE_COVER_DELETED` (`'page.cover_deleted'`, `'warning'`)

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/mediaPolicy.cover.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_PURPOSES, isMediaPurpose, resolveOwnerKey } from '../utils/mediaPolicy.js';
import { AUDIT_ACTIONS } from '../services/audit.service.js';

describe('cerita-cover media policy & audit actions', () => {
  it('registers cerita-cover as an uploader-owned photo purpose', () => {
    assert.equal(isMediaPurpose('cerita-cover'), true);
    assert.deepEqual(MEDIA_PURPOSES['cerita-cover'], {
      kinds: ['photo'],
      owner: { type: 'uploader' },
    });
    assert.equal(resolveOwnerKey('cerita-cover', 'user-123'), 'user-123');
  });

  it('registers page cover audit actions', () => {
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_UPDATED.action, 'page.cover_updated');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_UPDATED.severity, 'info');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_DELETED.action, 'page.cover_deleted');
    assert.equal(AUDIT_ACTIONS.PAGE_COVER_DELETED.severity, 'warning');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx --test src/__tests__/mediaPolicy.cover.test.ts`
Expected: FAIL (`isMediaPurpose('cerita-cover')` returns `false`, `AUDIT_ACTIONS.PAGE_COVER_UPDATED` is `undefined`).

- [ ] **Step 3: Update `schema.prisma`, `mediaPolicy.ts`, and `audit.service.ts`, and generate Prisma migration + client**

1. In `backend/prisma/schema.prisma`, add to `model Page`:
   - `coverAssetId String? @map("cover_asset_id")`
   - `@@index([coverAssetId])`
2. In `backend/src/utils/mediaPolicy.ts`, add `'cerita-cover': { kinds: ['photo'], owner: { type: 'uploader' } },` to `MEDIA_PURPOSES`.
3. In `backend/src/services/audit.service.ts`, add:
   - `PAGE_COVER_UPDATED: defineAction('page.cover_updated', 'info'),`
   - `PAGE_COVER_DELETED: defineAction('page.cover_deleted', 'warning'),`
4. Create the migration and regenerate Prisma client (`cd backend && set -a && . ../.env && set +a && npx prisma migrate dev --name add_page_cover_asset` if DB is up, or `--create-only` + `npx prisma generate` if local DB is stopped — note which was used).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx tsx --test src/__tests__/mediaPolicy.cover.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/utils/mediaPolicy.ts backend/src/services/audit.service.ts backend/src/__tests__/mediaPolicy.cover.test.ts
git commit -m "feat(backend): add Page.coverAssetId schema, cerita-cover policy, and audit actions"
```

---

### Task 2: Backend Page Cover Endpoints & Service (`putPageCover`, `deletePageCover`, `deletePage` detach)

**Files:**
- Modify: `backend/src/services/pages.service.ts`
- Modify: `backend/src/controllers/pages.controller.ts`
- Modify: `backend/src/routes/pages.routes.ts`
- Test: `backend/src/__tests__/pages.cover.test.ts`
- Test: `backend/src/__tests__/pages.routes.test.ts`

**Interfaces:**
- Consumes: `attachMedia`, `detachMedia`, `MediaServiceError`, `AUDIT_ACTIONS.PAGE_COVER_UPDATED`, `AUDIT_ACTIONS.PAGE_COVER_DELETED`
- Produces:
  - `PageSummaryDTO`, `PageDetailDTO`, `PageAuthoringDTO` each include `coverAssetId: string | null`
  - `putPageCover(rawSlug: string, rawInput: unknown, actor: AuditActor, reqContext?: AuditRequestContext, client = prisma): Promise<PageAuthoringDTO>`
  - `deletePageCover(rawSlug: string, actor: AuditActor, reqContext?: AuditRequestContext, client = prisma, options: { expectedUpdatedAt: string }): Promise<PageAuthoringDTO>`
  - `PUT /api/pages/:slug/cover` (body `{ coverAssetId: string, expectedUpdatedAt: string }`) -> `200 { message, page }`
  - `DELETE /api/pages/:slug/cover?expectedUpdatedAt=...` -> `200 { message, page }`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/__tests__/pages.cover.test.ts` testing:
1. `toPageSummary` / `getPages` / `getPageBySlug` return `coverAssetId` (`null` or UUID).
2. `putPageCover` rejects invalid slug (400), missing/invalid UUID `coverAssetId` (400 plain Indonesian, no field names), stale `expectedUpdatedAt` (409 `STALE_WRITE`), missing page (404).
3. `putPageCover` attaches the new `cerita-cover` asset with `{ type: 'page', id: page.id, slot: 'cover' }`, updates `coverAssetId`, writes `PAGE_COVER_UPDATED` audit log (`{ slug, hasCover: true }`), and returns `PageAuthoringDTO`.
4. `putPageCover` when replacing an existing cover locks `[oldId, newId]` in ascending order, attaches new, and leniently detaches old.
5. `putPageCover` when `existing.coverAssetId === input.coverAssetId` re-asserts `attachMedia` without bumping `updatedAt` or writing an audit row.
6. `deletePageCover` rejects stale token (409), is a no-op when `coverAssetId` is already `null`, and otherwise leniently detaches, sets `coverAssetId: null`, and writes `PAGE_COVER_DELETED` (`{ slug, hasCover: false }`).
7. `deletePage` leniently detaches `existingPage.coverAssetId` inside its transaction when deleting a page that has a cover.

Also add route auth/CSRF/wiring assertions in `backend/src/__tests__/pages.routes.test.ts` for `PUT /api/pages/:slug/cover` and `DELETE /api/pages/:slug/cover`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx tsx --test src/__tests__/pages.cover.test.ts src/__tests__/pages.routes.test.ts`
Expected: FAIL (`putPageCover` / `deletePageCover` not exported).

- [ ] **Step 3: Implement backend DTOs, service methods, controller handlers, and routes**

1. In `backend/src/services/pages.service.ts`:
   - Add `coverAssetId: string | null` to `PageSummaryDTO`, `PageWithChapterCount`, `toPageSummary`, `PageDetailDTO`, `PageRowWithChapters`, `toPageDetail`, `createPage` return value, and `toPageAuthoring`.
   - Implement `putPageCoverSchema` (`coverAssetId`: UUID regex with plain Indonesian message `'Gambar thumbnail tidak valid. Unggah ulang gambarnya.'`, `expectedUpdatedAt`), `lockAssetsForUpdate`, `toPageCoverMediaError` (mirroring `toFigureMediaError`), `putPageCover`, and `deletePageCover` using `executeLockedTransaction({ isolationLevel: 'ReadCommitted', ... })`.
   - Update `deletePage` so if `existingPage.coverAssetId` is present, it runs inside `executeLockedTransaction` (`ReadCommitted`), locks `[existingPage.coverAssetId]`, calls `detachMedia(..., { lenient: true })`, deletes the page, and writes `PAGE_DELETED`.
2. In `backend/src/controllers/pages.controller.ts`:
   - Add `putPageCoverHandler` and `deletePageCoverHandler` using `authoringHandler` (`paramOf(req, 'slug')`, `parseExpectedUpdatedAtQuery` for DELETE).
3. In `backend/src/routes/pages.routes.ts`:
   - Mount `router.put('/:slug/cover', apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, putPageCoverHandler)` and `router.delete('/:slug/cover', apiLimiter, verifyToken, requireEditorOrAdmin, pagesWriteLimiter, deletePageCoverHandler)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx tsx --test src/__tests__/pages.cover.test.ts src/__tests__/pages.routes.test.ts src/__tests__/pages.service.test.ts src/__tests__/pages.authoring.test.ts src/__tests__/pages.controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pages.service.ts backend/src/controllers/pages.controller.ts backend/src/routes/pages.routes.ts backend/src/__tests__/pages.cover.test.ts backend/src/__tests__/pages.routes.test.ts
git commit -m "feat(backend): add PUT/DELETE /api/pages/:slug/cover and expose coverAssetId"
```

---

### Task 3: Modular Client-Side Crop Math (`imageCrop.ts`) & `ImageCropModal.vue`

**Files:**
- Create: `frontend/src/utils/imageCrop.ts`
- Create: `frontend/src/components/common/ImageCropModal.vue`
- Test: `frontend/src/__tests__/imageCrop.spec.ts`
- Test: `frontend/src/__tests__/ImageCropModal.spec.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_BANNER_ASPECT_RATIO = 1851 / 731`
  - `DEFAULT_BANNER_TARGET_WIDTH = 1851`, `DEFAULT_BANNER_TARGET_HEIGHT = 731`
  - `computeCoverCropRect(params: { naturalWidth: number; naturalHeight: number; aspectRatio: number; zoom: number; panX: number; panY: number }): CropSourceRect`
  - `computeExportDimensions(cropWidth: number, targetWidth: number, targetHeight: number): { width: number; height: number }`
  - `computeSafeZoneBox(frameWidth: number, frameHeight: number, safeAspectRatio?: number): { x: number; y: number; width: number; height: number }`
  - `ImageCropModal.vue` props: `open`, `title`, `description?`, `aspectRatio?`, `targetWidth?`, `targetHeight?`, `safeAspectRatio?`, `currentPreviewUrl?`, `hasCustomImage?`, `busy?`, `error?`, `errorKind?`, `stale?`; emits: `save(file: File)`, `remove()`, `close()`, `reload()`

- [ ] **Step 1: Write the failing tests**

1. Create `frontend/src/__tests__/imageCrop.spec.ts` asserting:
   - `computeCoverCropRect` on square (`1000×1000`), portrait (`800×1200`), and ultra-wide (`3000×600`) inputs with `aspectRatio = 1851 / 731` and `zoom = 1` always produces `sw / sh` within `0.01` of `1851 / 731`, `sx >= 0`, `sy >= 0`, `sx + sw <= naturalWidth`, `sy + sh <= naturalHeight`.
   - Increasing `zoom = 2` halves `sw` and `sh`, and extreme `panX = 9999` / `panY = -9999` clamps strictly inside image bounds.
   - `computeExportDimensions(800, 1851, 731)` returns `{ width: 800, height: 316 }` (no upscaling); `computeExportDimensions(2400, 1851, 731)` returns `{ width: 1851, height: 731 }`.
   - `computeSafeZoneBox` returns a centered rectangle inside `(frameWidth, frameHeight)`.
2. Create `frontend/src/__tests__/ImageCropModal.spec.ts` (mocking `URL.createObjectURL`/`revokeObjectURL` and canvas `getContext('2d')`/`toBlob`) asserting:
   - Renders `BaseModal`, file input (`PHOTO_ACCEPT`), current preview when no new file is picked yet, and "Hapus thumbnail" only when `hasCustomImage` is true.
   - Rejects invalid file type/oversize locally using `validatePhotoFile` without clearing an existing preview.
   - Keyboard arrow keys and `+`/`-` zoom controls update zoom/pan and `aria-valuenow`.
   - Clicking "Simpan" exports a cropped `File` (`image/webp` or `image/png`) and emits `save`.
   - Displays `AlertBanner` on `error` and stale reload button on `stale`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/imageCrop.spec.ts src/__tests__/ImageCropModal.spec.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `imageCrop.ts` and `ImageCropModal.vue`**

1. Create `frontend/src/utils/imageCrop.ts` with pure, documented geometry helpers (`computeCoverCropRect`, `clampPan`, `computeExportDimensions`, `computeSafeZoneBox`, `exportCroppedCanvasBlob`). Fill canvas background (`#0f172a` / opaque) before `drawImage` so transparent PNGs/circular badges produce clean opaque banners.
2. Create `frontend/src/components/common/ImageCropModal.vue` wrapping `BaseModal` (`size="lg"`):
   - File picker + dropzone (`validatePhotoFile`).
   - Focusable `<canvas>` preview container (`tabindex="0"`, `role="application"` or `aria-label` describing pan/zoom controls) with pointer drag-to-pan, dashed center safe-zone guide (`safeAspectRatio`, default `4 / 3`), zoom range slider (`1` to `4`, step `0.05`) + `-` / `+` buttons + `Pusatkan ulang` button.
   - Live export on submit (`exportCroppedCanvasBlob` -> `new File([blob], 'thumbnail.webp', { type: blob.type })`) emitting `save(file)`.
   - `Hapus` button (when `hasCustomImage` is true) emitting `remove()`.
   - Stale reload box and `AlertBanner` (`kind`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/imageCrop.spec.ts src/__tests__/ImageCropModal.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/imageCrop.ts frontend/src/components/common/ImageCropModal.vue frontend/src/__tests__/imageCrop.spec.ts frontend/src/__tests__/ImageCropModal.spec.ts
git commit -m "feat(frontend): add modular ImageCropModal and cover crop math"
```

---

### Task 4: Frontend Media Purpose, Store & Service Integration

**Files:**
- Modify: `frontend/src/services/media.service.ts`
- Modify: `frontend/src/utils/userMessages.ts`
- Modify: `frontend/src/stores/pages.store.ts`
- Modify: `frontend/src/services/ceritaAdmin.service.ts`
- Modify: `frontend/src/stores/ceritaAdmin.store.ts`
- Test: `frontend/src/__tests__/pages.store.spec.ts`
- Test: `frontend/src/__tests__/ceritaAdmin.store.spec.ts`

**Interfaces:**
- Consumes: `PUT /api/pages/:slug/cover`, `DELETE /api/pages/:slug/cover`
- Produces:
  - `MediaPurpose` includes `'cerita-cover'`
  - `PageSummary.coverAssetId: string | null`, `PageDetail.coverAssetId?: string | null`, `HierarchyPage.coverAssetId: string | null`
  - `ceritaAdmin.service`: `putPageCover(slug: string, coverAssetId: string, expectedUpdatedAt: string): Promise<void>`, `deletePageCover(slug: string, expectedUpdatedAt: string): Promise<void>`
  - `ceritaAdmin.store`: `updatePageCover(slug: string, coverAssetId: string, expectedUpdatedAt: string): Promise<WriteOutcome>`, `deletePageCover(slug: string, expectedUpdatedAt: string): Promise<WriteOutcome>`

- [ ] **Step 1: Write the failing tests**

1. In `frontend/src/__tests__/pages.store.spec.ts`, add assertions that `fetchHierarchy` preserves `coverAssetId` on `pages` (`PageSummary`) and `hierarchyPages` (`HierarchyPage`), and `fetchPageBySlug` syncs `coverAssetId` changes back into `pages`.
2. In `frontend/src/__tests__/ceritaAdmin.store.spec.ts`, add tests for `updatePageCover` (calls `PUT /api/pages/:slug/cover` with `coverAssetId` and `expectedUpdatedAt`, refreshes hierarchy) and `deletePageCover` (calls `DELETE /api/pages/:slug/cover?expectedUpdatedAt=...`, refreshes hierarchy, surfaces `stale: true` on 409 `STALE_WRITE`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/pages.store.spec.ts src/__tests__/ceritaAdmin.store.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement service, token filter, and store updates**

1. Add `'cerita-cover'` to `MediaPurpose` and `MEDIA_PURPOSE_KINDS` (`'photo'`) in `frontend/src/services/media.service.ts`.
2. Add `'coverAssetId'` to `HIDDEN_API_TOKENS` in `frontend/src/utils/userMessages.ts`.
3. Update `PageSummary`, `PageDetail`, `HierarchyPage`, `toHierarchyPage`, `startHierarchyFetch`, and `fetchPageBySlug` in `frontend/src/stores/pages.store.ts` to carry `coverAssetId: string | null` (defaulting `null` if absent in older fixtures).
4. Add `putPageCover` and `deletePageCover` in `frontend/src/services/ceritaAdmin.service.ts`, and `updatePageCover` / `deletePageCover` in `frontend/src/stores/ceritaAdmin.store.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/pages.store.spec.ts src/__tests__/ceritaAdmin.store.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/media.service.ts frontend/src/utils/userMessages.ts frontend/src/stores/pages.store.ts frontend/src/services/ceritaAdmin.service.ts frontend/src/stores/ceritaAdmin.store.ts frontend/src/__tests__/pages.store.spec.ts frontend/src/__tests__/ceritaAdmin.store.spec.ts
git commit -m "feat(frontend): wire cerita-cover media purpose, pages store, and ceritaAdmin cover actions"
```

---

### Task 5: Admin Cerita UI (`CeritaThumbnailDialog`, `CeritaPageCard`, `CeritaStructurePanel`, `AdminCeritaView`)

**Files:**
- Modify: `frontend/src/components/admin/cerita/ceritaDomIds.ts`
- Create: `frontend/src/components/admin/cerita/CeritaThumbnailDialog.vue`
- Modify: `frontend/src/components/admin/cerita/CeritaPageCard.vue`
- Modify: `frontend/src/components/admin/cerita/CeritaPageCardList.vue`
- Modify: `frontend/src/components/admin/cerita/CeritaStructurePanel.vue`
- Modify: `frontend/src/views/AdminCeritaView.vue`
- Create: `frontend/src/__tests__/CeritaThumbnailDialog.spec.ts`
- Modify: `frontend/src/__tests__/CeritaPageCard.spec.ts`
- Modify: `frontend/src/__tests__/AdminCeritaView.spec.ts`

**Interfaces:**
- Consumes: `ImageCropModal.vue`, `useAuthenticatedBlobUrl`, `mediaPreviewPath`, `uploadMedia`, `ceritaCoverFor`, `ceritaAdmin.store` (`updatePageCover`, `deletePageCover`)
- Produces:
  - `ceritaIds.cardThumbnail(slug)` and `ceritaIds.pageThumbnail`
  - `CeritaPageCard` emits `'thumbnail'` and renders `coverAssetId` via `useAuthenticatedBlobUrl` (`?variant=thumbnail`, `IntersectionObserver` lazy load) with `ceritaCoverFor(page.slug)` fallback
  - `CeritaStructurePanel` emits `'edit-thumbnail'`
  - `CeritaThumbnailDialog` handles upload -> `updatePageCover`, remove -> `deletePageCover`, and stale-write reload

- [ ] **Step 1: Write the failing tests**

1. Create `frontend/src/__tests__/CeritaThumbnailDialog.spec.ts`:
   - Shows `ImageCropModal` with `aspectRatio = 1851 / 731`, fetches current custom cover preview via `apiFetch` when `coverAssetId` is set (or shows bundled `ceritaCoverFor` when null).
   - On `save(file)`: calls `uploadMedia(file, 'cerita-cover')` then emits `submit` with `result.id` (or calls store action).
   - On `remove`: emits `remove`.
   - Surfaces `MediaUploadError` in `AlertBanner` without losing state.
2. Update `frontend/src/__tests__/CeritaPageCard.spec.ts`:
   - Existing `page` fixture includes `coverAssetId: null`.
   - Emits `'thumbnail'` when clicking `data-test="card-thumbnail-btn"`.
   - When `page.coverAssetId` is `'asset-1'`, loads `/api/media/asset-1/preview?variant=thumbnail` via `useAuthenticatedBlobUrl` instead of `ceritaCoverFor`.
3. Update `frontend/src/__tests__/AdminCeritaView.spec.ts`:
   - Clicking card thumbnail button or structure panel `Ubah thumbnail` button opens `CeritaThumbnailDialog` and returns focus to the trigger button after closing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/CeritaThumbnailDialog.spec.ts src/__tests__/CeritaPageCard.spec.ts src/__tests__/AdminCeritaView.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Admin Cerita thumbnail dialog, card preview, and view wiring**

1. Add `cardThumbnail: (slug: string) => \`cerita-kartu-${slug}-thumbnail\`` and `pageThumbnail: 'cerita-halaman-thumbnail'` to `ceritaDomIds.ts`.
2. Create `CeritaThumbnailDialog.vue` wrapping `ImageCropModal.vue` (`aspectRatio = 1851 / 731`, `targetWidth = 1851`, `targetHeight = 731`), loading authenticated preview URL when `coverAssetId` is non-null (otherwise `ceritaCoverFor(slug)`), uploading cropped `File` via `uploadMedia(file, 'cerita-cover')`, and reporting errors/busy state cleanly.
3. Update `CeritaPageCard.vue` (lazy `IntersectionObserver` + `useAuthenticatedBlobUrl` on `${mediaPreviewPath(page.coverAssetId)}?variant=thumbnail`, fallback to `ceritaCoverFor(props.page.slug)`, add `CardActionButton` with `PhotoIcon`, `label="Thumbnail"`, `data-test="card-thumbnail-btn"`) and forward `'thumbnail'` through `CeritaPageCardList.vue`.
4. Update `CeritaStructurePanel.vue` header to add `Ubah thumbnail` button (`data-test="page-thumbnail"`, emitting `'edit-thumbnail'`).
5. Wire `thumbnailTarget` state, `openThumbnail`, `closeThumbnail`, `submitThumbnail`, `removeThumbnail`, `reloadFromThumbnail`, and focus handback in `AdminCeritaView.vue`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/CeritaThumbnailDialog.spec.ts src/__tests__/CeritaPageCard.spec.ts src/__tests__/AdminCeritaView.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/cerita/ frontend/src/views/AdminCeritaView.vue frontend/src/__tests__/CeritaThumbnailDialog.spec.ts frontend/src/__tests__/CeritaPageCard.spec.ts frontend/src/__tests__/AdminCeritaView.spec.ts
git commit -m "feat(frontend): add Cerita thumbnail editing and authenticated card preview"
```

---

### Task 6: Public Homepage (`HomeView.vue` & `StatOverview.vue`) Dynamic Cover Integration

**Files:**
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/components/common/StatOverview.vue`
- Modify: `frontend/src/__tests__/HomeView.spec.ts`
- Modify: `frontend/src/__tests__/StatOverview.spec.ts`

**Interfaces:**
- Consumes: `usePagesStore().pages` (`slug`, `coverAssetId`), `mediaPublicImagePath` (`/api/media/<id>`)
- Produces: Dynamic `bgImage` per Cerita category on `HomeView.vue` with `CERITA_COVERS` fallback

- [ ] **Step 1: Write the failing tests**

1. In `frontend/src/__tests__/HomeView.spec.ts`, add a test verifying that when `pagesStore.pages` contains `{ slug: 'kependudukan', ..., coverAssetId: 'cover-uuid-1' }`, the corresponding `StatOverview` receives `bgImage: '/api/media/cover-uuid-1'`, while categories with `coverAssetId: null` (or before pages load) keep `CERITA_COVERS[slug]`.
2. In `frontend/src/__tests__/StatOverview.spec.ts`, verify `backgroundImage` CSS style wraps `url("...")` and retains `backgroundSize: 'cover'` and `backgroundPosition: 'center'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/HomeView.spec.ts src/__tests__/StatOverview.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Update `HomeView.vue` and `StatOverview.vue`**

1. In `HomeView.vue`, use `usePagesStore()` and a `computed` list `ceritaCategories` that maps `CERITA_CATEGORIES` and overrides `bgImage` to `/api/media/${encodeURIComponent(page.coverAssetId)}` when the matching page in `pagesStore.pages` has a non-null `coverAssetId`.
2. In `StatOverview.vue`, quote `url("${props.bgImage}")` in `containerStyle`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/HomeView.spec.ts src/__tests__/StatOverview.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/HomeView.vue frontend/src/components/common/StatOverview.vue frontend/src/__tests__/HomeView.spec.ts frontend/src/__tests__/StatOverview.spec.ts
git commit -m "feat(frontend): reflect dynamic Cerita page coverAssetId on HomeView"
```

---

### Task 7: Documentation Sync & Full Verification

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update `docs/SPEC.md` and `docs/ARCHITECTURE.md`**

- In `docs/SPEC.md`: document `pages.cover_asset_id`, the `cerita-cover` media purpose, `PUT`/`DELETE /api/pages/:slug/cover` endpoints and audit actions (`page.cover_updated`, `page.cover_deleted`), and `/admin/cerita` + `HomeView` cover resolution with `CERITA_COVERS` fallback.
- In `docs/ARCHITECTURE.md`: list `utils/imageCrop.ts`, `components/common/ImageCropModal.vue`, `components/admin/cerita/CeritaThumbnailDialog.vue`, and the `pages` cover endpoints.

- [ ] **Step 2: Run full backend verification**

Run:
```bash
cd backend && npm run lint && npm test
```
Expected: 0 lint errors and all unit tests PASS.

- [ ] **Step 3: Run full frontend verification**

Run:
```bash
cd frontend && npm run lint && npm run type-check && npm run test:unit -- --run && npm run build
```
Expected: 0 lint errors, 0 type-check errors, all unit tests PASS, Vite production build succeeds.

- [ ] **Step 4: Commit docs**

```bash
git add docs/SPEC.md docs/ARCHITECTURE.md
git commit -m "docs: document Cerita page cover thumbnail API and cropper components"
```

---

## Self-Review Check

- **Spec coverage:** Schema (`cover_asset_id`), `'cerita-cover'` policy, `PUT/DELETE /api/pages/:slug/cover`, `deletePage` detach, `ImageCropModal` (`1851 / 731`, safe-zone guide, non-upscaling export, drag/zoom/keyboard), `CeritaThumbnailDialog`, `CeritaPageCard` + `CeritaStructurePanel`, `HomeView` dynamic resolution, `HIDDEN_API_TOKENS`, and `SPEC.md`/`ARCHITECTURE.md` sync are all mapped to Tasks 1–7.
- **Type & name consistency:** `coverAssetId`, `'cerita-cover'`, `putPageCover`, `deletePageCover`, `updatePageCover`, `ImageCropModal.vue`, `imageCrop.ts`, and `CeritaThumbnailDialog.vue` match across all tasks.
- **Review Focus coverage:** Every item in Review Focus has dedicated tests in Tasks 2, 3, 5, and 6.
