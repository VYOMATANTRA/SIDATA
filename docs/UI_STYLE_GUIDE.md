# UI Design Style Guide: SIDATA Kelurahan Manggar

## 1. Core Design Tokens (Tailwind v4 Configuration)

**Font Family:** `Public Sans` (Google Fonts)
**Base Theme:** Mobile-first approach, light theme default (no dark mode).

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,100..900;1,100..900&display=swap");

@theme {
  /* Colors */
  --color-brand-ungu-janda: #bb63ff;
  --color-brand-ubi-ungu: #5b58eb;
  --color-brand-biru-hytam: #0a2353; /* Primary Base Color */
  --color-brand-biru-aja: #112c71;
  --color-brand-cyan: #56e1e9;
  --color-brand-dark-bg: rgba(
    0,
    27,
    72,
    0.9
  ); /* Used for specific UI buttons/overlays */

  --color-surface-glass: rgba(255, 255, 255, 0.2); /* For stat containers */
  --color-surface-footer: #0a2353;

  /* Typography */
  --font-sans: "Public Sans", sans-serif;

  /* Border Radius */
  --radius-btn: 10px;
  --radius-card: 12px;
}

/* Custom Typography Utilities (Tailwind v4) */
@utility text-h1 {
  font-size: 42px;
  line-height: 68px;
  font-weight: 700;
}

@utility text-h2 {
  font-size: 26px;
  line-height: 42px;
  font-weight: 600;
}

@utility text-h3 {
  font-size: 16px;
  line-height: 26px;
  font-weight: 500;
}

@utility text-h4 {
  font-size: 10px;
  line-height: 16px;
  font-weight: 400;
}

@utility text-body-lg {
  font-size: 16px;
  line-height: 26px;
  font-weight: 400;
}

@utility text-body-sm {
  font-size: 14px;
  line-height: 23px;
  font-weight: 400;
}
```

## 2. Typography System

Use these custom Tailwind utility classes (defined above) to enforce the typography hierarchy across all Vue components.

- **H1 (Hero Titles):** `text-h1 text-white`
- **H2 (Section Titles/Sambutan):** `text-h2` (Use `text-white` on dark backgrounds)
- **H3 (Subtitles/Nav Links):** `text-h3`
- **H4 (Small Labels/Specific Buttons):** `text-h4`
- **Body Large (General Descriptions):** `text-body-lg`
- **Body Small (Footer Text/Minor Details):** `text-body-sm`

## 3. Vue Component Specifications

File modularization is strictly enforced. Below are the structural rules to build the core components using Vue 3 and Tailwind v4.

### A. Buttons (`BaseButton.vue`)

Buttons must accept props for `variant` (primary, secondary), `state` (default, hover, disabled), and `withIcon` (boolean).

**1. Custom Micro-Button (Per User Specifications):**

- **Padding:** `py-[10px] px-[7px]`
- **Border:** `border border-brand-biru-hytam`
- **Text:** `text-h4` (10px, Regular)
- **Radius:** `rounded-btn` (10px)

**2. Standard Action Buttons (Based on UI Toolkit):**

- **Primary Default:** `bg-brand-biru-hytam text-white border border-transparent`
- **Primary Hover:** `bg-white text-brand-biru-hytam border border-brand-biru-hytam`
- **Primary Disabled:** `bg-gray-300 text-gray-600 cursor-not-allowed`
- **Secondary Default:** `bg-white text-brand-biru-hytam border border-brand-biru-hytam`
- **Secondary Hover:** `bg-brand-biru-hytam text-white border border-transparent`
- **Icon Treatment:** If `withIcon` is true, wrap content in `flex items-center gap-2`.

### B. Glassmorphism Stat Cards (`StatCard.vue`)

Used for displaying demographic and regional data over image backgrounds.

- **Container Background:** `bg-surface-glass` (`rgba(255, 255, 255, 0.2)`)
- **Border Radius:** `rounded-card` (12px)
- **Padding:** `py-[10px] px-[13px]`
- **Layout:** `flex flex-row justify-between items-center gap-[10px]`
- **Stat Value (Number):** `text-[16px] font-medium leading-[26px] text-white text-center`
- **Stat Label (Text):** `text-h4 text-white text-center`
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
  - **Column Titles:** `text-h3 text-white`
  - **Links:** `text-body-sm text-white hover:opacity-80 transition-opacity`
- **Copyright Text:** `text-body-sm text-white text-center w-full mt-4`

## 4. Coding Directives

1. **Vue `<script setup>` Structure:** Use Vue 3 Composition API with `<script setup>`.
2. **Tailwind v4 Best Practices:** Rely on the natively defined `@theme` variables (e.g., `bg-brand-biru-hytam`) and custom `@utility` classes (e.g., `text-h1`) rather than heavy arbitrary brackets (like `text-[42px]`) to maintain the single source of truth.
3. **Component Modularity:** Break down complex screens. E.g., The Stat Overview should consist of `<StatSection>`, which loops through an array of objects to render multiple `<StatCard>` components.
