# Tasks: §8 Landing Page Assembly & Public Route Setup

- [x] **Task 1: Relocate Logged-in Placeholder to `/dashboard` & Configure Routes**
  - [x] Create `frontend/src/views/DashboardView.vue` with the "Login Berhasil" screen, user email/role info, and logout button
  - [x] Register `/dashboard` in `frontend/src/router/index.ts` with `meta: { requiresAuth: true, title: 'Dasbor' }`
  - [x] Confirm `/` is public with `meta: { title: 'Beranda' }`
  - [x] Update `frontend/src/__tests__/router.spec.ts` with tests for public `/` access and protected `/dashboard` redirection
  - [x] Create `frontend/src/__tests__/DashboardView.spec.ts` to test the dashboard view rendering and logout

- [ ] **Task 2: Update `SectionHero.vue` Landmark Semantics**
  - [ ] Update `frontend/src/components/landing/SectionHero.vue` root element to `<section id="hero" aria-labelledby="hero-title">` to ensure `<main>` remains the single top landmark
  - [ ] Verify single `<h1>` tag in hero remains intact

- [ ] **Task 3: Assemble Landing Page in `HomeView.vue` (Spec §8 Order)**
  - [ ] Integrate `<AppNavbar>` with skip link, `#actions` slot (login/logout/user management), and `#menu` slot
  - [ ] Assemble sections inside `<main id="main-content">` in exact order:
    - [ ] 1. `<SectionHero />`
    - [ ] 2. `<SectionSambutanLurah />`
    - [ ] 3. `<section id="cerita-preview">` with `<slot name="cerita-preview">` and accessible placeholder (`<h2>`)
    - [ ] 4. `<SectionHighlights />` (`<h2>` and `<h3>` items)
    - [ ] 5. `<section id="widget-cuaca">` with `<slot name="weather">` and accessible placeholder (`<h2>`)
  - [ ] Integrate `<AppFooter />` component
  - [ ] Retain logout logic and store calls

- [ ] **Task 4: Update and Expand Unit Tests & Accessibility Assertions**
  - [ ] Update `frontend/src/__tests__/HomeView.spec.ts` to assert:
    - [ ] Landmark presence (`<nav>`, `<main#main-content>`, `<footer>`)
    - [ ] Exactly one `<h1>` in hero
    - [ ] Strict heading hierarchy (`<h1>` in Hero → `<h2>` in Sambutan Lurah → `<h2>` in Cerita preview → `<h2>` in Highlights → `<h3>` highlight cards → `<h2>` in Widget Cuaca)
    - [ ] Presence of Cerita preview and Weather widget slots
    - [ ] Authentication states (unauthenticated login button vs authenticated user badge and logout)
  - [ ] Run full test suite (`npx vitest run`)
  - [ ] Run type check (`npm run type-check`)
  - [ ] Run linter (`npm run lint`)
