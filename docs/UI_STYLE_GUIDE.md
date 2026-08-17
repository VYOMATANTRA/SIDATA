# UI Design Style Guide: SIDATA Kelurahan Manggar

## 1. Core Design Tokens (Tailwind Configuration)
To ensure Antigravity uses the exact hex values and fonts, inject these design tokens into your `tailwind.config.js` file.

**Font Family:** `Public Sans` (Google Fonts)
**Base Theme:** Mobile-first approach, light theme default (no dark mode).

```
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          unguJanda: '#BB63FF',
          ubiUngu: '#5B58EB',
          biruHytam: '#0A2353', // Primary Base Color
          biruAja: '#112C71',
          cyan: '#56E1E9',
          darkBg: 'rgba(0, 27, 72, 0.9)', // Used for specific UI buttons/overlays
        },
        surface: {
          glass: 'rgba(255, 255, 255, 0.2)', // For stat containers
          footer: '#0A2353',
        }
      },
      fontFamily: {
        sans: ['"Public Sans"', 'sans-serif'],
      },
      fontSize: {
        'h1': ['42px', { lineHeight: '68px', fontWeight: '700' }],
        'h2': ['26px', { lineHeight: '42px', fontWeight: '600' }],
        'h3': ['16px', { lineHeight: '26px', fontWeight: '500' }],
        'h4': ['10px', { lineHeight: '16px', fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '26px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '23px', fontWeight: '400' }],
      },
      borderRadius: {
        'btn': '10px',
        'card': '12px',
      }
    }
  }
}
```

## 2. Typography System

Use these Tailwind utility classes to enforce the typography hierarchy across all Vue components.

- **H1 (Hero Titles):** `text-h1 text-white`

    

- **H2 (Section Titles/Sambutan):** `text-h2` (Use `text-white` on dark backgrounds)  

- **H3 (Subtitles/Nav Links):** `text-h3`

    

- **H4 (Small Labels/Specific Buttons):** `text-h4`

- **Body Large (General Descriptions):** `text-body-lg`

    

- **Body Small (Footer Text/Minor Details):** `text-body-sm`

    

## 3. Vue Component Specifications

File modularization is strictly enforced. Below are the structural rules for Antigravity to build the core components.

### A. Buttons (`BaseButton.vue`)

Buttons must accept props for `variant` (primary, secondary), `state` (default, hover, disabled), and `icon` (boolean).

**1. Custom Micro-Button (Per User Specifications):**

- **Padding:** `py-[10px] px-[7px]`
- **Border:** `border border-brand-biruHytam`
- **Text:** `text-h4` (10px, Regular)
- **Radius:** `rounded-btn` (10px)

**2. Standard Action Buttons (Based on UI Toolkit):**

- **Primary Default:** `bg-brand-biruHytam text-white border border-transparent`
- **Primary Hover:** `bg-white text-brand-biruHytam border border-brand-biruHytam`
- **Primary Disabled:** `bg-gray-300 text-gray-100 cursor-not-allowed`
- **Secondary Default:** `bg-white text-brand-biruHytam border border-brand-biruHytam`
- **Secondary Hover:** `bg-brand-biruHytam text-white border border-transparent`
- **Icon Treatment:** If `withIcon` is true, wrap content in `flex items-center gap-2`.

### B. Glassmorphism Stat Cards (`StatCard.vue`)

Used for displaying demographic and regional data over image backgrounds.  

- **Container Background:** `bg-surface-glass` (`rgba(255, 255, 255, 0.2)`)  

- **Border Radius:** `rounded-card` (12px)  

- **Padding:** `py-[10px] px-[13px]`

    

- **Layout:** `flex flex-row justify-between items-center gap-[10px]`

    

- **Stat Value (Number):** `text-[16px] font-medium leading-[26px] text-white text-center`

    

- **Stat Label (Text):** `text-[10px] font-regular leading-[16px] text-white text-center`

    

- **Icons:** Contained within a `30x30px` frame with a `2px solid white` border configuration.  

### C. Layout & Sections

The design is mobile-first, optimized for a `412px` viewport.  

- **Hero Section (`HeroSection.vue`):**

  - Padding: `pt-[250px] pb-[80px] px-[16px]`

     

  - Layout: `flex flex-col items-center gap-[13px]`

      

  - Background: Linear gradient overlay `rgba(0,0,0,0.4)` over image.  

- **Standard Section Containers:**

  - Padding: `py-[116px] px-[20px]`

      

  - Gap between text area and cards: `10px`

      

  - Background: Linear gradient overlay `rgba(0,0,0,0.75)` to `rgba(68,68,68,0.75)` blending with images.  

### D. Footer (`AppFooter.vue`)

- **Container:** `bg-surface-footer px-[30px] pt-[22px] pb-[0px]`

    

- **Branding Area:** `flex flex-row items-center gap-[15px]`

    

- **Dividers:** Vertical/Horizontal lines using `border border-white` or `border-black/25`.  

- **Link Columns:** `flex flex-col gap-[5px]`.  

  - Column Titles: `text-h3 text-white`

      

  - Links: `text-body-sm text-white hover:opacity-80 transition-opacity`

      

- **Copyright Text:** `text-body-sm text-white text-center w-full mt-4`

    

## 4. Coding Directives for Antigravity

1. **Vue `<script setup>` Structure:** Use Vue 3 Composition API with `<script setup>`.
2. **Tailwind Arbitrary Values:** Avoid arbitrary values (e.g., `text-[16px]`) in templates where possible; use the defined `tailwind.config.js` tokens (e.g., `text-h3`) to maintain the single source of truth.
3. **Component Modularity:** Break down complex screens. E.g., The Stat Overview should consist of `<StatSection>`, which loops through an array of objects to render multiple `<StatCard>` components.

