# UI Design Style Guide: SIDATA Kelurahan Manggar

## 1. Color System: Navy and White

The brand is **navy (`#0A2353`) and white**. Every neutral is navy composited over white, so the
whole interface reads as one family. The only other colors allowed are the three **semantic
status colors** (error, warning, success): users must recognise failure, caution and success at a
glance, and navy cannot carry that distinction.

Rules:

1. **Use tokens, not palette classes.** No `slate-*`, `gray-*`, `rose-*`, `cyan-*`, `indigo-*`,
   `violet-*` or `teal-*` utilities in new code. Use the tokens below (`bg-surface-muted`,
   `text-text-muted`, `border-border`, `text-status-error`, ...).
2. **Precomputed hex, never opacity, for text.** `text-brand-navy/60` fades unpredictably over
   different backgrounds; use `text-text-muted` instead. Opacity is fine for glass fills and
   overlays on photos, never for body text.
3. **Status color never stands alone.** Always pair it with text or an icon (WCAG 1.4.1). An
   error border needs an error message tied by `aria-describedby`; a success tint needs words.
4. **No decorative accents.** Cyan, violet, indigo and teal are deprecated (see below). Express
   hierarchy with navy fills, navy outlines and the muted surface instead.
5. **Exceptions keep their original colors:** official logos (Balikpapan, BPS, ITK, Desa Cantik,
   VYOMATANTRA), photographs, weather illustrations (`assets/img/weathers/`) and base-map tiles.
   Do not tint, recolor or filter them. Map marker colors are a separate pending decision.

### Token table

All tokens live in `frontend/src/assets/main.css` under `@theme`, so each one is also a Tailwind
utility (`bg-surface-muted`, `text-text-muted`, `border-border-strong`, `ring-focus-ring`, ...).
Contrast is the WCAG 2.1 relative-luminance ratio against the stated background.

| Token                                        | Value                 | Use                                             | Contrast                         |
| -------------------------------------------- | --------------------- | ----------------------------------------------- | -------------------------------- |
| `--color-brand-navy`                         | `#0A2353`             | Primary brand, headings, body text, primary CTA | 15.24:1 on white                 |
| `--color-surface`                            | `#FFFFFF`             | Page and card background                        | n/a                              |
| `--color-surface-muted`                      | `#F3F4F6` (navy 5%)   | Alternating bands, quiet panels                 | navy text 13.85:1                |
| `--color-surface-hover`                      | `#E7E9EE` (navy 10%)  | Hover/pressed tint, skeletons, disabled fill    | navy text 12.54:1                |
| `--color-surface-inverse`                    | `#0A2353`             | Navy bands, footer, hero                        | white text 15.24:1               |
| `--color-surface-glass`                      | `rgba(255,255,255,0.2)` | Frosted cards over photos (text stays white)  | depends on photo; keep a scrim   |
| `--color-border`                             | `#D3D7E0` (navy 18%)  | Dividers, card edges (decorative)               | 1.44:1; not for control edges    |
| `--color-border-strong`                      | `#8491A9` (navy 50%)  | Form control edges, chart marks                 | 3.18:1 on white (WCAG 1.4.11)    |
| `--color-text-muted`                         | `#4F6183` (navy 72%)  | Secondary text, captions, placeholders          | 6.23:1 on white, 5.66:1 on muted |
| `--color-text-inverse`                       | `#FFFFFF`             | Text on navy                                    | 15.24:1 on navy                  |
| `--color-text-inverse-muted`                 | `#B6BDCB` (white 70%) | Secondary/disabled text on navy                 | 8.08:1 on navy                   |
| `--color-focus-ring`                         | `#0A2353`             | Focus ring on light surfaces                    | 15.24:1 on white                 |
| `--color-focus-ring-inverse`                 | `#FFFFFF`             | Focus ring on navy surfaces                     | 15.24:1 on navy                  |
| `--color-status-error`                       | `#BE123C`             | Error text, icon, invalid border                | 6.29:1 on white, 5.72:1 on tint  |
| `--color-status-error-surface` / `-border`   | `#FFF1F2` / `#FECDD3` | Error banner                                    | n/a                              |
| `--color-status-warning`                     | `#92400E`             | Warning text and icon                           | 7.09:1 on white, 6.84:1 on tint  |
| `--color-status-warning-surface` / `-border` | `#FFFBEB` / `#FDE68A` | Warning banner                                  | n/a                              |
| `--color-status-success`                     | `#047857`             | Success text and icon                           | 5.48:1 on white, 5.21:1 on tint  |
| `--color-status-success-surface` / `-border` | `#ECFDF5` / `#A7F3D0` | Success banner                                  | n/a                              |

Legacy helpers still defined: `--color-brand-navy-deep` (`#112C71`, tonal navy for gradients only)
and `--color-brand-navy-overlay` (`rgba(0,27,72,0.9)`, pressed state on navy).

**Deprecated (do not use in new code):** `--color-brand-cyan`, `--color-brand-violet`,
`--color-brand-indigo`, `--color-brand-teal-deep`. They remain defined only because admin/CMS
screens, the map and a few views still reference them; each is removed when its last reference
migrates. Prefer `brand-navy`, `surface-muted` and `border-strong`.

### Focus states

- Every interactive element needs a visible focus indicator on `:focus-visible`; never remove it
  without a replacement. (WCAG 2.4.7 is AA, but the project convention is to ship it.)
- Light surface: `ring-2 ring-focus-ring ring-offset-2 ring-offset-surface`, or
  `outline-2 outline-offset-2 outline-focus-ring`.
- Navy surface: `ring-focus-ring-inverse ring-offset-surface-inverse` (white ring, navy offset).
- `BaseButton` uses a navy ring with a **white offset**, which stays visible even when the button
  sits on a navy band (the white gap is the cue). `BaseLink` switches to the inverse ring for
  `variant="white"`.
- Form controls (`utils/formStyles.ts`) use a 2px navy outline with a 1px offset.

### Disabled states

Disabled controls stay legible (never hidden, never faded with `opacity`) and are distinguished
by shape and cursor, not color alone:

- Buttons: flat fill (`surface-hover` for primary, white for secondary), `border-border`,
  `text-text-muted` (5.13:1 on `surface-hover`), no shadow, `cursor-not-allowed`; native
  `disabled` on buttons, `aria-disabled` plus `tabindex="-1"` on anchors.
- Links with no valid destination render as a disabled `<button>` in `text-text-muted` (or
  `text-text-inverse-muted` on navy), never an `href="#"` anchor.
- Form fields: `bg-surface-hover text-text-muted cursor-not-allowed`.

### Design source availability

Admin (CMS) desktop wireframes exist. **Public desktop designs are not available**: the Figma
source (`SIDATA Manggar`, fileKey `tnVcKOGwKTaFCG40wUHQpr`) has public mobile frames only, so
public desktop layouts are derived from the mobile design plus the rules in this guide and should
be reviewed with stakeholders rather than treated as pixel-specified.

## 1.1 Typography and Radius Tokens (Tailwind v4)

**Font Family:** `Public Sans` (Google Fonts)
**Base Theme:** Mobile-first approach, light theme default (no dark mode).

```css
@theme {
  --font-sans: "Public Sans", sans-serif;

  --text-xs: 10px;
  --text-xs--line-height: 16px;
  --text-xs--font-weight: 400;

  --text-sm: 14px;
  --text-sm--line-height: 23px;
  --text-sm--font-weight: 400;

  --text-base: 16px;
  --text-base--line-height: 26px;
  --text-base--font-weight: 400;

  --text-lg: 26px;
  --text-lg--line-height: 42px;
  --text-lg--font-weight: 600;

  --text-xl: 42px;
  --text-xl--line-height: 68px;
  --text-xl--font-weight: 700;

  /* Border Radius */
  --radius-btn: 10px;
  --radius-card: 12px;
}
```

## 2. Typography System

Font sizes are mapped directly onto Tailwind's default `text-*` scale via `@theme` (not custom
`@utility` classes), so the standard size utilities below already carry the project's line-height
and weight values — no bespoke `text-h*`/`text-body-*` classes exist. `h1`, `h2`, and `p` also get
their size applied automatically at the element level via an `@layer base` rule in `main.css`; the
utility classes remain for non-semantic elements or overrides.

- **XL (Heading 1, 42px/68px/700):** `text-xl text-brand-navy` (`text-text-inverse` on navy)
- **LG (Heading 2, 26px/42px/600):** `text-lg` (use `text-text-inverse` on dark backgrounds)
- **Base (Subtitles/Nav Links/General Descriptions, 16px/26px):** `text-base` — add `font-medium`
  for subtitle/nav-link emphasis (500 weight); omit it for plain body copy (400 weight)
- **SM (Minor Details, 14px/23px/400):** `text-sm`
- **XS (Small Labels/Specific Buttons, 10px/16px/400):** `text-xs`

## 3. Vue Component Specifications

File modularization is strictly enforced. Below are the structural rules to build the core components using Vue 3 and Tailwind v4.

### A. Buttons (`BaseButton.vue`)

Buttons must accept props for `variant` (primary, secondary), `state` (default, hover, disabled), and `withIcon` (boolean).

**1. Custom Micro-Button (Per User Specifications):**

- **Padding:** `py-[10px] px-[7px]`
- **Border:** `border border-brand-navy`
- **Text:** `text-xs` (10px, Regular)
- **Radius:** `rounded-btn` (10px)

**2. Standard Action Buttons (Based on UI Toolkit):**

- **Primary Default:** `bg-brand-navy text-text-inverse border-2 border-brand-navy`
- **Primary Hover:** `bg-surface text-brand-navy border-brand-navy`
- **Primary Active:** `bg-surface-hover text-brand-navy`
- **Primary Disabled:** `bg-surface-hover text-text-muted border-border cursor-not-allowed`
- **Secondary Default:** `bg-surface text-brand-navy border-2 border-brand-navy`
- **Secondary Hover:** `bg-brand-navy text-text-inverse`
- **Secondary Disabled:** `bg-surface text-text-muted border-border cursor-not-allowed`
- **Focus:** navy ring with white offset (see Focus states).
- **Icon Treatment:** If `withIcon` is true, wrap content in `flex items-center gap-2`.

### B. Glassmorphism Stat Cards (`StatCard.vue`)

Used for displaying demographic and regional data over image backgrounds.

- **Container Background:** `bg-surface-glass` (`rgba(255, 255, 255, 0.2)`); keep a dark scrim under it so white text stays readable
- **Border Radius:** `rounded-card` (12px)
- **Padding:** `py-[10px] px-[13px]`
- **Layout:** `flex flex-row justify-between items-center gap-[10px]`
- **Stat Value (Number):** `text-base font-medium text-text-inverse text-center`
- **Stat Label (Text):** `text-xs text-text-inverse text-center`
- **Icons:** Contained within a `30x30px` frame with a `border-2 border-white` configuration.

### C. Layout & Sections

The design is mobile-first, optimized for a `412px` viewport.

**Desktop scope (decided 2026-08-24):** desktop/larger-viewport layouts are in scope for
launch, not deferred. Public desktop frames do not exist in the Figma source (`SIDATA Manggar`,
fileKey `tnVcKOGwKTaFCG40wUHQpr`); admin desktop wireframes do. The public breakpoint strategy
is still outstanding and tracked as unstarted, not merely undocumented.

- **Hero Section (`HeroSection.vue`):**
  - **Padding:** `pt-[250px] pb-[80px] px-[16px]`
  - **Layout:** `flex flex-col items-center gap-[13px]`
  - **Background:** Linear gradient overlay `rgba(0,0,0,0.4)` over image.

- **Standard Section Containers:**
  - **Padding:** `py-[116px] px-[20px]`
  - **Gap between text area and cards:** `10px`
  - **Background:** Linear gradient overlay `rgba(0,0,0,0.75)` to `rgba(68,68,68,0.75)` blending with images.

### D. Footer (`AppFooter.vue`)

- **Container:** `bg-surface-inverse px-[30px] pt-[22px] pb-[0px]`
- **Branding Area:** `flex flex-row items-center gap-[15px]`
- **Dividers:** Vertical/Horizontal lines using `border-white/10` on navy.
- **Link Columns:** `flex flex-col gap-[5px]`
  - **Column Titles:** `text-base font-medium text-text-inverse`
  - **Links:** `text-sm` via `BaseLink variant="white"` (white text, white focus ring)
- **Copyright Text:** `text-sm text-text-inverse-muted text-center w-full mt-4`

## 4. Accessibility

Frontend markup MUST use semantic HTML and SHOULD conform to WCAG 2.1 Level A. The full rules,
the per-criterion table, and the current known-gaps list live in
[`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md) — read that before building a new component, not
after. The short version that applies directly to the components below:

- **Buttons (§3.A):** render a real `<button type="button">` by default; switch to `<a href>`
  only when a destination is passed — never a `<div>` with a click handler. This is already
  `BaseButton.vue`'s behavior; keep it that way as variants are added.
- **Stat cards (§3.B):** value/label pairs are semantically a description list (`<dl>/<dt>/<dd>`),
  not a plain `<div>` stack — `KeyStatistics.vue` already does this.
- **Layout & sections (§3.C):** each routed view gets exactly one `<main>` and one `<h1>`; section
  components use `<section>`, not bare `<div>`.
- **Footer (§3.D):** stays a real `<footer>` with `<nav aria-label="...">` per link column (already
  the convention); every link needs a real `href`, not a placeholder `"#"`.
- **Color (§1):** status colors are always paired with text or an icon; text colors meet the
  contrast ratios in the token table.

### Forms

No form component exists in this style guide yet, but the auth views (`LoginView.vue`,
`RegisterView.vue`, `SetupPassword.vue`) set the pattern new forms will follow. Every control MUST
pair a `<label for="...">` with a matching input `id` — a sibling `<label>` with no `for` looks
right visually but is not programmatically associated with its input. Credential fields SHOULD set
`autocomplete` (`email`, `current-password`, `new-password`). Field styling comes from
`frontend/src/utils/formStyles.ts` (`border-border-strong`, navy focus outline, `status-error`
invalid border). See [`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md) §4 for the rest.

### Layer order (public shell)

Lowest to highest: map root `z-0` (Leaflet stays inside it), chapter TOC sheet `z-30`, map summary
overlay `z-50`, sticky header `z-[55]` (its menu backdrop and sheet sit inside the header's own
stacking context), modals `z-[58]` (`BaseModal`, `OtpVerificationModal`), focused skip link `z-[60]`.
Keep page content at or below `z-50`. The same list is commented in `main.css`.

## 5. Coding Directives

1. **Vue `<script setup>` Structure:** Use Vue 3 Composition API with `<script setup>`.
2. **Tailwind v4 Best Practices:** Rely on the natively defined `@theme` variables (e.g., `bg-brand-navy`, `text-text-muted`, `text-xl`) rather than heavy arbitrary brackets (like `text-[42px]`) to maintain the single source of truth.
3. **Colors:** navy/white tokens plus the status exception only (§1); never reintroduce raw palette classes or the deprecated accents.
4. **Component Modularity:** Break down complex screens. E.g., The Stat Overview should consist of `<StatSection>`, which loops through an array of objects to render multiple `<StatCard>` components.

## 6. Follow-ups (not yet migrated to the navy/white tokens)

These public and admin surfaces still use slate/indigo or other raw palette classes. They are
owned by other PRs and are intentionally left untouched here.

| Surface                                                                  | Expected PR                      |
| ------------------------------------------------------------------------ | -------------------------------- |
| Landing sections (hero, highlights, Sambutan) and the weather widget     | Public visual refinements PR     |
| Remaining `AppFooter` spots (slate/indigo leftovers)                     | Public visual refinements PR     |
| VYOMATANTRA view (partially; check for remaining raw palette classes)    | Public visual refinements PR     |
| Map components (`InteractiveMap`, map summary/filters)                   | Map experience PR                |
| Auth views and components (Login, Register, SetupPassword, OTP modal)    | Public shell PR / auth follow-up |
| Admin screens (`AdminLayout`, sidebar, users, audit, settings, RT admin) | Admin PRs                        |
