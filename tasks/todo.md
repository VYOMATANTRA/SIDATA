# Tasks: §8 Landing Page Assembly & Public Route Setup

- [x] **Task 1: Relocate Logged-in Placeholder to `/dashboard` & Configure Routes**
  - [x] Create `frontend/src/views/DashboardView.vue` with the "Login Berhasil" screen, user email/role info, and logout button
  - [x] Register `/dashboard` in `frontend/src/router/index.ts` with `meta: { requiresAuth: true, title: 'Dasbor' }`
  - [x] Confirm `/` is public with `meta: { title: 'Beranda' }`
  - [x] Update `frontend/src/__tests__/router.spec.ts` with tests for public `/` access and protected `/dashboard` redirection
  - [x] Create `frontend/src/__tests__/DashboardView.spec.ts` to test the dashboard view rendering and logout

- [x] **Task 2: Update `SectionHero.vue` Landmark Semantics**
  - [x] Update `frontend/src/components/landing/SectionHero.vue` root element to `<section id="hero" aria-labelledby="hero-title">` to ensure `<main>` remains the single top landmark
  - [x] Verify single `<h1>` tag in hero remains intact

- [x] **Task 3: Assemble Landing Page in `HomeView.vue` (Spec §8 Order)**
  - [x] Integrate `<AppNavbar>` with skip link, `#actions` slot (login/logout/user management), and `#menu` slot
  - [x] Assemble sections inside `<main id="main-content">` in exact order:
    - [x] 1. `<SectionHero />`
    - [x] 2. `<SectionSambutanLurah />`
    - [x] 3. `<section id="cerita-preview">` with `<slot name="cerita-preview">` and accessible placeholder (`<h2>`)
    - [x] 4. `<SectionHighlights />` (`<h2>` and `<h3>` items)
    - [x] 5. `<section id="widget-cuaca">` with `<slot name="weather">` and accessible placeholder (`<h2>`)
  - [x] Integrate `<AppFooter />` component
  - [x] Retain logout logic and store calls

- [x] **Task 4: Update and Expand Unit Tests & Accessibility Assertions**
  - [x] Update `frontend/src/__tests__/HomeView.spec.ts` to assert:
    - [x] Landmark presence (`<nav>`, `<main#main-content>`, `<footer>`)
    - [x] Exactly one `<h1>` in hero
    - [x] Strict heading hierarchy (`<h1>` in Hero → `<h2>` in Sambutan Lurah → `<h2>` in Cerita preview → `<h2>` in Highlights → `<h3>` highlight cards → `<h2>` in Widget Cuaca)
    - [x] Presence of Cerita preview and Weather widget slots
    - [x] Authentication states (unauthenticated login button vs authenticated user badge and logout)
  - [x] Run full test suite (`npx vitest run`)
  - [x] Run type check (`npm run type-check`)
  - [x] Run linter (`npm run lint`)
