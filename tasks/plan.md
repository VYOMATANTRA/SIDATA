# Implementation Plan: §8 Landing Page Assembly & Public Route Setup

## Overview
Implement the public landing page for SIDATA (Spec §8) on `/`, move the legacy authenticated placeholder ("Login Berhasil") to a dedicated `/dashboard` route with `requiresAuth: true`, and assemble the five landing page sections in the exact order specified by Spec §8:
1. **Hero** (institutional voice with single `<h1>`)
2. **Sambutan Lurah** (welcoming voice with `<h2>`)
3. **Cerita preview** (slot / section placeholder with `<h2>`)
4. **Publikasi / Peta highlights** (`<h2>` with `<h3>` sub-cards)
5. **Widget Cuaca** (slot / section placeholder with `<h2>`)

The page will integrate the PR #56 UI base components ([AppNavbar.vue](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/components/common/AppNavbar.vue) and [AppFooter.vue](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/components/common/AppFooter.vue)), consume dynamic content from the PR #58 stores ([contentBlocks.store.ts](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/stores/contentBlocks.store.ts) and [settings.store.ts](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/stores/settings.store.ts)), strictly adhere to [docs/ACCESSIBILITY.md](file:///home/perhanjay/Documents/Programming/SIDATA/docs/ACCESSIBILITY.md) (single `<h1>`, logical heading hierarchy, landmark navigation, skip link), and update the Vue Router guard test suite.

---

## Architecture & Design Decisions

### 1. Moving the Logged-in Placeholder to `/dashboard`
- **Context:** Historically, `/` was configured with `meta: { requiresAuth: true }` and displayed a minimal "Login Berhasil" card with a logout button.
- **Decision:** Extract that "Login Berhasil" screen into a new view component `frontend/src/views/DashboardView.vue` and register it at `path: '/dashboard'` with `meta: { requiresAuth: true, title: 'Dasbor' }`.
- **Rationale:** 
  - Keeps `/` strictly public for unauthenticated citizens and visitors.
  - Provides a dedicated protected destination for authenticated users and future dashboard widgets.
  - Enables clean router test assertions verifying that unauthenticated visitors are redirected from `/dashboard` to `/login`, while `/` remains publicly accessible without bouncing.

### 2. Integration with Base UI Components (PR #56)
- **Context:** PR #56 introduced production-ready base UI components including [AppNavbar.vue](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/components/common/AppNavbar.vue) and [AppFooter.vue](file:///home/perhanjay/Documents/Programming/SIDATA/frontend/src/components/common/AppFooter.vue), but `HomeView.vue` was temporarily using ad-hoc inline `<nav>` and `<footer>` elements from an earlier prototype.
- **Decision:**
  - Replace the ad-hoc inline `<nav>` in `HomeView.vue` with `<AppNavbar>`:
    - Bind `variant="navy"` (or configurable variant) and `sticky="true"`.
    - Populate `#actions` slot:
      - When unauthenticated: "Masuk (Login)" button/link pointing to `/login`.
      - When authenticated: user email/role badge, "Manajemen Pengguna" button (if admin), and "Keluar (Logout)" button.
    - Populate `#menu` slot for mobile drawer navigation.
  - Replace the ad-hoc inline `<footer>` in `HomeView.vue` with `<AppFooter>`:
    - Automatically displays the Spec §8 resources (Sumber Daya, Tentang, Cerita), SDGs badges, and institutional collaboration logos (BPS, ITK, VYOMATANTRA).

### 3. Landmark & Heading Structure (WCAG Level A per `docs/ACCESSIBILITY.md`)
- **Skip Link:** Retain `<a href="#main-content">` at the very top of `HomeView.vue` for keyboard users (WCAG 2.4.1 Bypass Blocks).
- **Landmarks:**
  - `<header>`: Chrome container provided by `<AppNavbar>`.
  - `<main id="main-content">`: Exactly one `<main>` landmark per view.
  - `<footer>`: Chrome container provided by `<AppFooter>`.
- **Heading Hierarchy:**
  - **Single `<h1>`:** Located in `SectionHero.vue` (`<h1 id="hero-title">{{ hero.title || settingsStore.tagline }}</h1>`).
  - **Section Headings (`<h2>`):**
    - Section 2: Sambutan Lurah (`<h2 id="sambutan-title">`)
    - Section 3: Cerita Preview (`<h2 id="cerita-preview-title">`)
    - Section 4: Highlights (`<h2 id="highlights-title">`)
    - Section 5: Widget Cuaca (`<h2 id="weather-widget-title">`)
  - **Sub-headings (`<h3>`):**
    - Highlight items within Section 4 use `<h3>`, maintaining an uninterrupted hierarchy without skipping levels (`<h1>` → `<h2>` → `<h3>`).

### 4. Slot Architecture for Cerita Preview and Weather Widget
- **Context:** The issue states: *"Cerita preview and weather are separate issues; leave slots."*
- **Decision:**
  - In `HomeView.vue`, between Sambutan Lurah and Highlights, render an accessible section wrapper for Cerita Preview:
    ```html
    <section id="cerita-preview" aria-labelledby="cerita-preview-title" class="border-b border-slate-200/80 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="mx-auto max-w-6xl space-y-8">
        <slot name="cerita-preview">
          <!-- Accessible placeholder slot fallback indicating pending Cerita cards -->
        </slot>
      </div>
    </section>
    ```
  - After Highlights, render an accessible section wrapper for Weather Widget:
    ```html
    <section id="widget-cuaca" aria-labelledby="weather-widget-title" class="border-b border-slate-200/80 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="mx-auto max-w-6xl space-y-8">
        <slot name="weather">
          <!-- Accessible placeholder slot fallback indicating BMKG weather forecast widget -->
        </slot>
      </div>
    </section>
    ```
  - This allows future PRs for Cerita Preview and Weather Widget to plug directly into the designated slots or replace the slot default contents without altering page flow or landmark semantics.

---

## Tasks & Phases

### Phase 1: Route Setup & Logged-In Placeholder Relocation (Size: S)
- **Task 1.1**: Create `frontend/src/views/DashboardView.vue`
  - Re-host the "Login Berhasil" card, user details (email, role), and working logout handler.
  - Follow accessible landmarks (`<main>`, single `<h1>`).
- **Task 1.2**: Update `frontend/src/router/index.ts`
  - Confirm `path: '/'` is public (`meta: { title: 'Beranda' }`).
  - Register `path: '/dashboard'` with `component: () => import('../views/DashboardView.vue')`, `meta: { requiresAuth: true, title: 'Dasbor' }`.
- **Task 1.3**: Update router unit tests in `frontend/src/__tests__/router.spec.ts`
  - Test unauthenticated visitors can freely access `/` without redirection.
  - Test unauthenticated visitors navigating to `/dashboard` are redirected to `/login`.
  - Test authenticated users can access `/dashboard`.

### Phase 2: Landing Page Assembly in Spec §8 Order (Size: M)
- **Task 2.1**: Update `frontend/src/components/landing/SectionHero.vue`
  - Ensure it renders as `<section id="hero" aria-labelledby="hero-title">` inside `<main>` rather than a top-level `<header>`.
  - Ensure single `<h1>` semantics remain intact.
- **Task 2.2**: Assemble `frontend/src/views/HomeView.vue` in exact Spec §8 order:
  1. Skip link (`a[href="#main-content"]`).
  2. `<AppNavbar>` (with `#actions` and `#menu` slots for auth state and navigation).
  3. `<main id="main-content">`:
     - 1. `<SectionHero />` (institutional voice, `<h1>`)
     - 2. `<SectionSambutanLurah />` (welcoming voice, `<h2>`)
     - 3. `<section id="cerita-preview">` with `<slot name="cerita-preview">` (`<h2>`)
     - 4. `<SectionHighlights />` (Publikasi / Peta highlights, `<h2>` → `<h3>`)
     - 5. `<section id="widget-cuaca">` with `<slot name="weather">` (`<h2>`)
  4. `<AppFooter />` (Spec §8 footer).

### Phase 3: Verification & Test Suite Expansion (Size: S)
- **Task 3.1**: Create `frontend/src/__tests__/DashboardView.spec.ts`
  - Verify "Login Berhasil" text, email/role display, and logout trigger.
- **Task 3.2**: Update `frontend/src/__tests__/HomeView.spec.ts`
  - Verify landmark structure: `<nav>`/`<header>`, `<main#main-content>`, `<footer>`.
  - Verify heading order: exactly one `<h1>`, followed by `<h2>` for Sambutan Lurah, Cerita preview, Highlights, and Widget Cuaca.
  - Verify Cerita preview slot and Weather widget slot exist in proper order.
  - Verify auth state display in `<AppNavbar>`.
  - Verify logout flow.
- **Task 3.3**: Run full test and lint suite
  - `npx vitest run` in `frontend/` (all tests passing).
  - `npm run type-check` in `frontend/`.
  - `npm run lint` in `frontend/`.

---

## Verification Plan

### Automated Verification
1. **Frontend Unit Tests:**
   ```bash
   cd frontend && npx vitest run
   ```
   Assert all router, HomeView, SectionHero, AppNavbar, AppFooter, and DashboardView tests pass.
2. **Type Checking:**
   ```bash
   cd frontend && npm run type-check
   ```
   Ensure no TypeScript diagnostics or broken props.
3. **Linting & Formatting:**
   ```bash
   cd frontend && npm run lint
   ```
   Verify Oxlint and ESLint pass without warnings.

### Manual Accessibility Verification
1. Tab through the landing page:
   - First tab stop hits the skip link ("Lewati ke konten utama").
   - Pressing Enter on skip link shifts focus to `#main-content`.
2. Inspect heading levels in browser DevTools / accessibility tree:
   - Level 1: `Hero` ("Portal Data Terpadu Kelurahan Manggar" or custom tagline)
   - Level 2: `Sambutan Lurah`
   - Level 2: `Cerita & Data Wilayah` (slot)
   - Level 2: `Potensi Unggulan Wilayah` (highlights)
   - Level 3: Individual highlight cards
   - Level 2: `Prakiraan Cuaca Manggar` (slot)
   - Level 2: Footer sections ("Sumber Daya", "Tentang", "Cerita")
3. Confirm unauthenticated vs authenticated states:
   - Public visitor on `/` sees full landing page and "Masuk (Login)" in navbar.
   - Public visitor navigating to `/dashboard` gets redirected to `/login`.
   - Logged-in user sees role/email and can log out cleanly.
