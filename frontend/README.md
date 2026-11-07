# frontend

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm ci
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev/)

Real-browser (Chromium) tests for what jsdom cannot prove: paint order, hit targets, scroll and
focus, mobile viewports. Specs live in `e2e/`; Vitest ignores that folder.

```sh
npx playwright install chromium   # one-time browser download (about 300 MB)
npm run test:e2e                  # all projects: mobile, mobile-small, desktop
npm run test:e2e -- --project=mobile e2e/map-summary.mobile.spec.ts
npm run test:e2e -- --project=desktop e2e/map-summary.desktop.spec.ts
npm run test:e2e:ui               # Playwright UI mode
```

- Projects: `mobile` (375x812, touch), `mobile-small` (320x640, touch), `desktop` (1280x800).
  Specs are split by filename: `*.mobile.spec.ts` runs in `mobile` and `mobile-small`,
  `*.desktop.spec.ts` runs in `desktop`.
- The suite never touches a real backend or the internet. `e2e/support/mocks.ts` stubs `/api/**`
  (maps points/summary, public settings, CSRF; `/api/auth/refresh` returns 401 so the visitor is
  logged out) with synthetic data and answers OpenStreetMap tile requests with a generated PNG, so
  real Leaflet tile and marker layers render. Import `test`/`expect` from `e2e/support/test`, which
  applies those mocks automatically, and abort-block any other external host.
- A test FAILS on any unmocked `/api` call, so a missing mock is caught instead of silently hitting
  nothing. Opt out per test or file with `test.use({ allowUnmockedApi: true })` (option defined in
  `e2e/support/test.ts`). External hosts (e.g. Google Fonts) are aborted and recorded but never fail
  a test.
- Playwright starts its own Vite dev server on port 5199 (`--strictPort`, never reused), so it does
  not collide with `npm run dev` on 5173. That server drops Vue DevTools (`e2e/vite.e2e.config.ts`),
  whose injected panel would otherwise sit on top of the page in hit tests.
- Reports, traces and failure screenshots go to `e2e/.output/` (git-ignored). Open the HTML report
  with `npx playwright show-report e2e/.output/report`.
- E2E is not part of the default CI workflow yet; run it locally when changing map, overlay or
  mobile-layout behaviour.

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
