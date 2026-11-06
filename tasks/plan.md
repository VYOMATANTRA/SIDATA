# Implementation Plan: Mobile Navbar Drawer Accessibility and Footer Real Hrefs

## Overview
This plan implements accessible mobile navigation drawer controls in `AppNavbar.vue` and verifies all real router destinations in `AppFooter.vue` according to docs/SPEC.md §8 and docs/ACCESSIBILITY.md. It adopts strict Test-Driven Development (TDD) using Vitest, ensuring unit tests reproduce expected behaviors (RED) before writing minimal functional code (GREEN) and refactoring (REFACTOR).

## Architecture Decisions
1. **Focus Return on Escape**: In `AppNavbar.vue`, maintain a template reference to the hamburger toggle `<button ref="toggleButtonRef">`. When the drawer is open and the `Escape` key is pressed, close the drawer and programmatically return focus to the toggle button (`toggleButtonRef.value?.focus()`), satisfying WCAG 2.1 Level A / SPEC requirements for modal/drawer interactions.
2. **Drawer Focus Trapping**: Integrate the existing `useDrawerFocusTrap` composable (`frontend/src/composables/useDrawerFocusTrap.ts`) on the mobile drawer container (`#primary-navigation-menu`) to trap Tab and Shift+Tab navigation within the drawer while open, and close the drawer cleanly via `onEscape` returning focus to the toggle button.
3. **Default Drawer Nav Links**: Expand `AppNavbar.vue`'s default `#menu` slot fallback beyond the initial placeholder (`Beranda`) to render the full public resource navigation links (`Beranda`, `Publikasi`, `Peta`, `Ketua RT`, `Permintaan Data`, and `Tentang`), so views that reuse `AppNavbar` without a custom slot (e.g., `TentangPageLayout.vue` and its consuming pages) have complete mobile navigation.
4. **Footer Hrefs Verification**: Explicitly verify and test that `AppFooter.vue` renders valid and active route destinations across all four designated groups:
   - **Sumber Daya**: `/publikasi`, `/peta`, `/permintaan-data`, `/ketua-rt`
   - **Cerita**: 8 slugs (`/cerita/kependudukan`, `/cerita/pendidikan`, `/cerita/kesehatan`, `/cerita/ekonomi-dan-ketertiban`, `/cerita/geografis-dan-tata-ruang`, `/cerita/pemerintahan-dan-kelembagaan`, `/cerita/infrastruktur-dan-perumahan`, `/cerita/persampahan-dan-bank-sampah-unit`)
   - **Tentang**: `/tentang/kelurahan-manggar`, `/tentang/desa-cantik`, `/tentang/vyomatantra`
   - **Kolaborasi**: 3 partner logos (BPS, ITK, VYOMATANTRA) with descriptive `alt` text.

## Task List

### Phase 1: Test-Driven Development for AppNavbar Drawer
- [ ] Task 1: Write failing unit tests for AppNavbar drawer accessibility & focus return (RED)
- [ ] Task 2: Implement focus return, useDrawerFocusTrap integration, and default nav links in AppNavbar (GREEN)

### Checkpoint: AppNavbar Verified
- [ ] Focused tests pass: `npm run test:unit src/__tests__/AppNavbar.spec.ts`
- [ ] Lint & types pass: `npm run type-check && npm run lint`

### Phase 2: Test-Driven Development for AppFooter Hrefs
- [ ] Task 3: Write comprehensive unit tests for all AppFooter hrefs across 4 groups (RED)
- [ ] Task 4: Ensure all AppFooter link hrefs and attributes conform to spec (GREEN)

### Checkpoint: AppFooter Verified
- [ ] Focused tests pass: `npm run test:unit src/__tests__/AppFooter.spec.ts`

### Phase 3: Regression Testing and Clean Code Verification
- [ ] Task 5: Run full frontend test suite and type check (REFACTOR & CI gates)

### Checkpoint: Complete
- [ ] All 71+ unit test suites pass (`npm run test:unit`)
- [ ] `npm run type-check` succeeds with 0 errors
- [ ] `npm run lint` succeeds with 0 errors

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Focus return in JSDOM / Vitest may behave differently from real browser | Medium | In JSDOM, mock / assert on `document.activeElement` or `focus()` spy, and attach wrapper to `document.body` for realistic focus assertions. |
| Custom `#menu` slot in `HomeView.vue` could conflict with default drawer links | Low | `HomeView.vue` explicitly provides `#menu="{ close }"` which overrides the default slot; ensure default slot only renders when no custom menu slot is passed. |
| Open modal dialogs inside drawer receiving Escape | Low | `useDrawerFocusTrap` already checks `isEventFromOpenDialog(event)` before invoking `onEscape`, preventing Escape in modals from prematurely closing the navbar drawer. |

## Settled Decisions
- **Kolaborasi Logos Linking**: The three partner logos in `AppFooter.vue` are wrapped in accessible links:
  - BPS: outbound link to `https://www.bps.go.id` (`target="_blank"`, `rel="noopener noreferrer"`)
  - ITK: outbound link to `https://itk.ac.id` (`target="_blank"`, `rel="noopener noreferrer"`)
  - Tim Inovasi Sosial VYOMATANTRA: link to `/tentang/vyomatantra` (internal router link via `BaseLink` or `RouterLink`)
