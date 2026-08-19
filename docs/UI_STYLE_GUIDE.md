# UI Design Style Guide: SIDATA Kelurahan Manggar

## 1. Core Design Tokens (Tailwind v4 Configuration)

**Font Family:** `Public Sans` (Google Fonts)
**Base Theme:** Mobile-first approach, light theme default (no dark mode).

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,100..900;1,100..900&display=swap");

@theme {
  /* Colors */
  --color-brand-violet: #bb63ff;
  --color-brand-indigo: #5b58eb;
  --color-brand-navy: #0a2353; /* Primary Base Color */
  --color-brand-navy-deep: #112c71;
  --color-brand-cyan: #56e1e9;
  --color-brand-navy-overlay: rgba(
    0,
    27,
    72,
    0.9
  ); /* Used for specific UI buttons/overlays */

  --color-surface-glass: rgba(255, 255, 255, 0.2); /* For stat containers */

  /* Typography */
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
their size applied automatically at the element level (see `@layer base` above); the utility
classes remain for non-semantic elements or overrides.

- **XL (Heading 1, 42px/68px/700):** `text-xl text-white`
- **LG (Heading 2, 26px/42px/600):** `text-lg` (Use `text-white` on dark backgrounds)
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

- **Primary Default:** `bg-brand-navy text-white border border-transparent`
- **Primary Hover:** `bg-white text-brand-navy border border-brand-navy`
- **Primary Disabled:** `bg-gray-300 text-gray-600 cursor-not-allowed`
- **Secondary Default:** `bg-white text-brand-navy border border-brand-navy`
- **Secondary Hover:** `bg-brand-navy text-white border border-transparent`
- **Icon Treatment:** If `withIcon` is true, wrap content in `flex items-center gap-2`.

### B. Glassmorphism Stat Cards (`StatCard.vue`)

Used for displaying demographic and regional data over image backgrounds.

- **Container Background:** `bg-surface-glass` (`rgba(255, 255, 255, 0.2)`)
- **Border Radius:** `rounded-card` (12px)
- **Padding:** `py-[10px] px-[13px]`
- **Layout:** `flex flex-row justify-between items-center gap-[10px]`
- **Stat Value (Number):** `text-[16px] font-medium leading-[26px] text-white text-center`
- **Stat Label (Text):** `text-xs text-white text-center`
- **Icons:** Contained within a `30x30px` frame with a `border-2 border-white` configuration.

### C. Layout & Sections

The design is mobile-first, optimized for a `412px` viewport.

- **Hero Section (`HeroSection.vue`):**
  - **Padding:** `pt-[250px] pb-[80px] px-[16px]`
  - **Layout:** `flex flex-col items-center gap-[13px]`
  - **Background:** Linear gradient overlay `rgba(0,0,0,0.4)` over image.

- **Standard Section Containers:**
  - **Padding:** `py-[116px] px-[20px]`
  - **Gap between text area and cards:** `10px`
  - **Background:** Linear gradient overlay `rgba(0,0,0,0.75)` to `rgba(68,68,68,0.75)` blending with images.

### D. Footer (`AppFooter.vue`)

- **Container:** `bg-surface-footer px-[30px] pt-[22px] pb-[0px]`
- **Branding Area:** `flex flex-row items-center gap-[15px]`
- **Dividers:** Vertical/Horizontal lines using `border border-white` or `border-black/25`.
- **Link Columns:** `flex flex-col gap-[5px]`
  - **Column Titles:** `text-base font-medium text-white`
  - **Links:** `text-sm text-white hover:opacity-80 transition-opacity`
- **Copyright Text:** `text-sm text-white text-center w-full mt-4`

## 4. Coding Directives

1. **Vue `<script setup>` Structure:** Use Vue 3 Composition API with `<script setup>`.
2. **Tailwind v4 Best Practices:** Rely on the natively defined `@theme` variables (e.g., `bg-brand-navy`, `text-xl`) rather than heavy arbitrary brackets (like `text-[42px]`) to maintain the single source of truth.
3. **Component Modularity:** Break down complex screens. E.g., The Stat Overview should consist of `<StatSection>`, which loops through an array of objects to render multiple `<StatCard>` components.
