# Task List: Mobile Navbar Drawer Accessibility and Footer Real Hrefs

## Task 1: Write failing unit tests for AppNavbar drawer accessibility & focus return (RED) [DONE]

**Description:** Write unit tests in `src/__tests__/AppNavbar.spec.ts` asserting that when the drawer is open and the Escape key is pressed, the drawer closes AND focus is programmatically restored to the hamburger toggle button. Also test that the default drawer slot provides full navigation options (`Beranda`, `Publikasi`, `Peta`, `Ketua RT`, `Permintaan Data`, `Tentang`) and that Tab navigation is trapped within the open drawer.

**Acceptance criteria:**
- [x] Test fails (RED) on focus return to toggle button upon Escape.
- [x] Test fails (RED) if default drawer slot lacks navigation links to Publikasi, Peta, Ketua RT, Permintaan Data, or Tentang.
- [x] Test validates aria-expanded transitions on the toggle button (`false` -> `true` -> `false`).

**Verification:**
- [ ] Tests run: `npm run test:unit src/__tests__/AppNavbar.spec.ts` (fails as expected for new criteria)

**Dependencies:** None

**Files likely touched:**
- `frontend/src/__tests__/AppNavbar.spec.ts`

**Estimated scope:** Small (1 file)

---

## Task 2: Implement focus return, useDrawerFocusTrap integration, and default nav links in AppNavbar (GREEN & REFACTOR) [DONE]

**Description:** Update `AppNavbar.vue` to add a template ref `toggleButtonRef` to the toggle button, attach `drawerRef` to the mobile drawer container, integrate `useDrawerFocusTrap` to trap focus and handle Escape by closing the menu and returning focus to `toggleButtonRef.value?.focus()`, and provide the complete default navigation links in the drawer slot.

**Acceptance criteria:**
- [x] Toggle button has `:aria-expanded="isMenuOpen"` and properly controls the menu.
- [x] Pressing Escape closes the drawer and moves focus back to the toggle button.
- [x] Tab/Shift+Tab focus is trapped inside the drawer while open.
- [x] Default drawer menu includes links to Beranda, Publikasi, Peta, Ketua RT, Permintaan Data, and Tentang with clean styling and `@click="closeMenu"`.
- [x] All unit tests pass in `AppNavbar.spec.ts`.

**Verification:**
- [x] Tests pass: `npm run test:unit src/__tests__/AppNavbar.spec.ts`
- [x] Build/type check: `npm run type-check`
- [x] Lint: `npm run lint`

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/common/AppNavbar.vue`

**Estimated scope:** Small (1 file)

---

## Checkpoint: AppNavbar Verified [DONE]
- [x] All tests in `src/__tests__/AppNavbar.spec.ts` pass
- [x] `npm run type-check` succeeds with 0 errors
- [x] `npm run lint` succeeds with 0 errors

---

## Task 3: Write comprehensive unit tests for all AppFooter hrefs across 4 groups (RED) [DONE]

**Description:** Extend `src/__tests__/AppFooter.spec.ts` to thoroughly assert the existence and correct `href` targets of all links across the four groups specified in docs/SPEC.md §8: Sumber Daya (4 links), Cerita (8 stat pages), Tentang (3 pages), and Kolaborasi (3 partner logos).

**Acceptance criteria:**
- [x] Tests explicitly verify router link destinations:
  - Sumber Daya: `/publikasi`, `/peta`, `/permintaan-data`, `/ketua-rt`
  - Cerita: `/cerita/kependudukan`, `/cerita/pendidikan`, `/cerita/kesehatan`, `/cerita/pemerintahan-dan-kelembagaan`, `/cerita/ekonomi-dan-ketertiban`, `/cerita/geografis-dan-tata-ruang`, `/cerita/infrastruktur-dan-perumahan`, `/cerita/persampahan-dan-bank-sampah-unit`
  - Tentang: `/tentang/kelurahan-manggar`, `/tentang/desa-cantik`, `/tentang/vyomatantra`
- [x] Tests explicitly assert all 3 Kolaborasi logos are wrapped in accessible links with proper destinations (`https://www.bps.go.id`, `https://itk.ac.id`, `/tentang/vyomatantra`) and `alt` attributes.

**Verification:**
- [x] Tests run: `npm run test:unit src/__tests__/AppFooter.spec.ts` (fails on missing logo links)

**Dependencies:** None

**Files likely touched:**
- `frontend/src/__tests__/AppFooter.spec.ts`

**Estimated scope:** Small (1 file)

---

## Task 4: Ensure all AppFooter link hrefs and attributes conform to spec (GREEN & REFACTOR) [DONE]

**Description:** Verify and adjust `AppFooter.vue` to ensure all links and logos match the exact spec requirements without regressions, including proper label names, responsive scales, and correct router targets.

**Acceptance criteria:**
- [x] All 4 footer groups match docs/SPEC.md §8.
- [x] Links use `BaseLink` with valid router destinations (`to`) or `href`.
- [x] All unit tests pass in `AppFooter.spec.ts`.

**Verification:**
- [x] Tests pass: `npm run test:unit src/__tests__/AppFooter.spec.ts`

**Dependencies:** Task 3

**Files likely touched:**
- `frontend/src/components/common/AppFooter.vue`

**Estimated scope:** Small (1 file)

---

## Checkpoint: AppFooter Verified [DONE]
- [x] All tests in `src/__tests__/AppFooter.spec.ts` pass
- [x] `npm run type-check` succeeds with 0 errors

---

## Task 5: Full regression test suite and verification gate [DONE]

**Description:** Run the full frontend test suite, type-check, and linter to guarantee no regressions in other components or views (e.g., `HomeView.vue`, `TentangPageLayout.vue`).

**Acceptance criteria:**
- [x] All 71+ test suites pass cleanly.
- [x] `npm run type-check` reports zero errors.
- [x] `npm run lint` reports zero errors.

**Verification:**
- [x] Tests pass: `npm run test:unit`
- [x] Type check passes: `npm run type-check`
- [x] Lint passes: `npm run lint`

**Dependencies:** Tasks 1-4

**Files likely touched:**
- None (verification only)

**Estimated scope:** XS

---

## Checkpoint: Complete [DONE]
- [x] All acceptance criteria met across AppNavbar and AppFooter
- [x] Clean test and lint report
