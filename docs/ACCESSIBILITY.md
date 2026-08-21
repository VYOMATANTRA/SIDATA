# Accessibility

SIDATA is a public information portal. Its highest-utility pages — Ketua RT lookup, local
statistics, the interactive map — exist to be used by residents, not just read about. This
document is the accessibility conformance target for the site and the concrete rules that follow
from it.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are
to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): MUST is a
hard requirement (a PR that violates one MUST be fixed before merge); SHOULD is a strong
expectation that can be knowingly deviated from with a stated reason; MAY is genuinely optional.

## 1. Conformance target

- The site **MUST** use semantic HTML — see §2.
- The site **SHOULD** conform to [WCAG 2.1](https://www.w3.org/TR/WCAG21/) **Level A**.

**Out of scope, deliberately:** WCAG Level AA is not the target here. Two AA criteria are worth
naming explicitly because their absence is easy to misread as an oversight rather than a decision:

- **1.4.3 Contrast (Minimum)** — not required at Level A. Color tokens are not currently audited
  for contrast (see §5).
- **2.4.7 Focus Visible** — not required at Level A. A visible focus indicator convention is
  described in §4 as a SHOULD, not enforced as a MUST.

If the project later adopts AA, these two are the natural starting point — most of the rest of AA
is already implied by following §2 and §3 carefully.

## 2. Semantic HTML (MUST)

These rules apply to every new component and every new page, regardless of WCAG level — they are
the foundation the Level A criteria in §3 build on, and they are dramatically cheaper to apply
while writing a component than to retrofit later.

- **Landmarks.** Every routed view MUST render exactly one `<main>`. Site chrome MUST use `<nav>`,
  `<header>`, `<footer>` rather than generic `<div>`s standing in for them.
- **Headings.** Every routed view MUST have exactly one `<h1>`. Heading levels MUST NOT skip
  (an `<h3>` MUST NOT appear without an `<h2>` ancestor on the page).
- **Interactive elements.** Anything clickable that performs an action or navigates MUST be a real
  `<button>` or `<a href>` — never a `<div>` or `<span>` with a click handler. `BaseButton.vue` is
  the reference implementation: it renders `<button type="button">` by default and switches to
  `<a>` only when `href` is passed.
- **Links MUST have an `href`.** A link with no destination is not a link — it is not focusable
  and not operable via assistive technology. Placeholder links MUST NOT ship as `href="#"`; use a
  disabled `<button>` or omit the element until the destination exists.
- **Tabular data.** Anything that is genuinely a table — the four fixed-shape matrix tables (age
  pyramid, ethnicity, religion×sex, occupation), the Ketua RT table, chart data — MUST be a real
  `<table>` with `<th scope="col">` / `<th scope="row">`, never a `<div>` grid laid out to look
  like one.
- **Forms.** Every form control MUST have a `<label for="...">` paired to a matching `id` — a
  sibling `<label>` with no `for` is not programmatically associated with its input, even though it
  looks correct visually.

## 3. WCAG 2.1 Level A — what applies here

Level A is 30 success criteria. Several are not applicable to this site and are noted as such
rather than silently skipped. The table below covers every criterion that does apply, plus the
notable exclusions.

| Criterion                           | Applies | Project rule                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content              | Yes     | Meaningful images get real `alt` text; decorative images use `alt="" aria-hidden="true"` (already the convention in `SectionHero.vue`, `KeyStatistics.vue`, `AppNavbar.vue`). Charts MUST have a text/table alternative — see the chart rule below.                                                                                                                                                                           |
| 1.2.1–1.2.3, 1.2.5 Time-based Media | No      | SPEC has no audio or video content in scope; `SectionHero.vue`'s decorative background video carries no information and needs no caption/transcript.                                                                                                                                                                                                                                                                          |
| 1.3.1 Info and Relationships        | Yes     | Structure MUST be conveyed in markup, not visual position alone — see §2's table and form rules.                                                                                                                                                                                                                                                                                                                              |
| 1.3.2 Meaningful Sequence           | Yes     | DOM order MUST match reading order; do not reorder content with CSS in a way that breaks a linear read.                                                                                                                                                                                                                                                                                                                       |
| 1.3.3 Sensory Characteristics       | Yes     | Instructions MUST NOT rely solely on shape/color/position ("click the button on the right").                                                                                                                                                                                                                                                                                                                                  |
| 1.4.1 Use of Color                  | Yes     | Charts and status indicators MUST NOT encode meaning by color alone — pair color with a label, icon, or pattern. The normalized `indicator_table_rows` schema (SPEC §7) means every chart already has a backing data table available to serve as that alternative.                                                                                                                                                            |
| 1.4.2 Audio Control                 | No      | No auto-playing audio exists or is planned.                                                                                                                                                                                                                                                                                                                                                                                   |
| 2.1.1 Keyboard                      | Yes     | Everything operable by mouse MUST be operable by keyboard. This is the site's biggest risk: the interactive map (SPEC §8) is very unlikely to be keyboard-operable by construction. Mitigation: the Ketua RT page MUST remain a fully keyboard-navigable table covering the same RT point data as the map, and the map and the Ketua RT page MUST link to each other — this equivalence is a requirement, not a nice-to-have. |
| 2.1.2 No Keyboard Trap              | Yes     | Modals (`OtpVerificationModal.vue`, the `UserManagement.vue` dialogs) MUST allow keyboard exit (Escape, or a reachable close button) and MUST NOT trap focus permanently.                                                                                                                                                                                                                                                     |
| 2.1.4 Character Key Shortcuts       | Yes     | No single-character shortcuts are planned; if any are added they MUST be remappable/disable-able.                                                                                                                                                                                                                                                                                                                             |
| 2.2.1 Timing Adjustable             | Yes     | The 15-minute OTP TTL and 60-second resend cooldown (SPEC §3) are timing limits with a security rationale — this is a recorded exception under WCAG's "Essential" exception, not an oversight.                                                                                                                                                                                                                                |
| 2.2.2 Pause, Stop, Hide             | Yes     | Auto-starting motion lasting over 5 seconds MUST have a pause/stop control. `SectionHero.vue`'s autoplay video honors `prefers-reduced-motion` but does not yet expose a pause control — see §5.                                                                                                                                                                                                                              |
| 2.3.1 Three Flashes                 | Yes     | Nothing on the site should flash; no exceptions planned.                                                                                                                                                                                                                                                                                                                                                                      |
| 2.4.1 Bypass Blocks                 | Yes     | A skip-to-content link MUST be available to jump past repeated navigation.                                                                                                                                                                                                                                                                                                                                                    |
| 2.4.2 Page Titled                   | Yes     | Every route MUST set a descriptive `<title>` via router meta.                                                                                                                                                                                                                                                                                                                                                                 |
| 2.4.3 Focus Order                   | Yes     | Tab order MUST follow a logical, visual reading order.                                                                                                                                                                                                                                                                                                                                                                        |
| 2.4.4 Link Purpose (In Context)     | Yes     | Link text MUST make sense out of context or with adjacent context — avoid bare "klik di sini."                                                                                                                                                                                                                                                                                                                                |
| 2.5.1 Pointer Gestures              | Yes     | No multipoint/path-based gestures are planned; the map MUST offer a single-pointer/tap equivalent for any gesture it does use.                                                                                                                                                                                                                                                                                                |
| 2.5.2 Pointer Cancellation          | Yes     | Actions MUST trigger on `up`, not `down`, so a press can be aborted by dragging away.                                                                                                                                                                                                                                                                                                                                         |
| 2.5.3 Label in Name                 | Yes     | Visible button/link text MUST be included in the accessible name (don't override with an unrelated `aria-label`).                                                                                                                                                                                                                                                                                                             |
| 2.5.4 Motion Actuation              | No      | No device-motion-triggered functionality is planned.                                                                                                                                                                                                                                                                                                                                                                          |
| 3.1.1 Language of Page              | Yes     | `frontend/index.html` MUST set `<html lang="id">`.                                                                                                                                                                                                                                                                                                                                                                            |
| 3.2.1 On Focus                      | Yes     | Focusing an element MUST NOT trigger a context change (navigation, form submit).                                                                                                                                                                                                                                                                                                                                              |
| 3.2.2 On Input                      | Yes     | Changing a form value MUST NOT trigger a context change without warning.                                                                                                                                                                                                                                                                                                                                                      |
| 3.3.1 Error Identification          | Yes     | Validation errors MUST be identified in text, not color alone, and MUST be associated with their field (`aria-describedby`).                                                                                                                                                                                                                                                                                                  |
| 3.3.2 Labels or Instructions        | Yes     | Every input MUST have a label or instruction — see §2's form rule.                                                                                                                                                                                                                                                                                                                                                            |
| 4.1.1 Parsing                       | N/A     | Removed from the standard in WCAG 2.2; not tracked here.                                                                                                                                                                                                                                                                                                                                                                      |
| 4.1.2 Name, Role, Value             | Yes     | Custom interactive widgets (modals, the map, OTP input group) MUST expose correct role/name/state via native elements or ARIA — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` for modals; a `fieldset`/`legend` or `aria-label` for the OTP input group.                                                                                                                                                            |

## 4. Per-area guidance

**Forms.** Pair every `<label for>` with a matching `id`. Set `autocomplete` on credential fields
(`email`, `current-password`, `new-password`). Tie validation messages to their field with
`aria-describedby`, and set `aria-invalid="true"` while an error is showing.

**Modals and dialogs.** MUST have `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`
pointing at the modal's own heading. MUST be closable via Escape. MUST return focus to the
triggering element on close.

**The interactive map.** Treat as enhancement, not the only path to the data — see the 2.1.1 row
above. The Ketua RT page is the required fallback, not a redundant page.

**Charts.** Never encode meaning by color alone (1.4.1). Provide the underlying data as a real
`<table>` — either visible or reachable via a "view as table" toggle — rather than only as a
canvas/SVG rendering.

**Data tables.** Real `<table>`, real `<th scope>`. This applies to the four matrix tables, the
Ketua RT table, and any chart data table from the point above.

**Images.** Meaningful images get real, specific `alt` text (not the filename, not "image").
Decorative images get `alt="" aria-hidden="true"` — the existing convention in the `sections/` and
`layout/` components.

**Motion.** Respect `prefers-reduced-motion` for anything that autoplays, per the existing
`SectionHero.vue` pattern. Anything that autoplays and runs longer than 5 seconds also needs a
pause control regardless of that media query (2.2.2) — reduced-motion handling alone does not
satisfy it.

**Focus indicator.** New components SHOULD use the `focus-visible:outline` convention already used
in `BaseButton.vue`, `BaseLink.vue`, and `AppNavbar.vue`, rather than the older
`focus:outline-none` + ring pattern in the auth views. This is a SHOULD (2.4.7 is AA, not required
at Level A per §1) but picking one convention avoids an inconsistent site.

## 5. Known gaps

This is an honest list of where the current code does not yet meet the rules above. It exists so
the gap between policy and reality is visible, not hidden by the fact that this document exists.

1. No routed view has a `<main>` landmark (`App.vue` is a bare `<RouterView />`). No skip link
   exists; `sr-only` styling is unused anywhere in the frontend.
2. The three modals in `UserManagement.vue` and `OtpVerificationModal.vue` have no `role="dialog"`,
   `aria-modal`, `aria-labelledby`, focus trap, Escape handling, or focus restore.
3. Form labels across `LoginView.vue`, `RegisterView.vue`, `SetupPassword.vue`, and
   `UserManagement.vue` are sibling `<label>` elements with no `for`/`id` pairing — not
   programmatically associated with their inputs. No credential field sets `autocomplete`. No
   validation error is tied to its field via `aria-describedby`/`aria-invalid`. The six OTP digit
   inputs are unlabelled.
4. `BaseLink.vue` can render an `<a>` with no `href` when the prop is omitted, which is not
   focusable and not a link. It never renders `RouterLink`. Several footer and CTA links currently
   point at placeholder `href="#"`.
5. Two competing focus-ring conventions coexist (see §4) — not yet reconciled.
6. `SectionHero.vue`'s autoplaying background video has no pause control (2.2.2), only a
   `prefers-reduced-motion` check.
7. `LoginView.vue` and `RegisterView.vue` open at `<h2>` with no `<h1>` on the page.
8. No route sets a per-page `<title>` — `frontend/src/router/` has no title-on-navigation
   mechanism, so every route shows the static title from `frontend/index.html` (2.4.2).

Not an accessibility item, but adjacent and worth its own fix: several new components reference
undefined design tokens (`bg-navy`, `--font-ui`, `gray-muted`, `gray-disabled` — not defined in
`frontend/src/assets/main.css`), so their real rendered colors are currently unverified. This
matters for a future AA contrast pass even though it's out of scope for Level A today.

## 6. How to verify

No automated accessibility tooling is wired into this repo yet. Until it is, verify manually:

- Tab through the page/component using only the keyboard — everything interactive should be
  reachable, operable, and show where focus is.
- Check heading order with the browser's accessibility inspector (or a heading-outline extension)
  — one `<h1>`, no skipped levels.
- Run the page through the browser's built-in accessibility audit (Chrome DevTools → Lighthouse →
  Accessibility, or the Accessibility panel) as a sanity check, not a substitute for the manual
  pass above.

Planned, not yet in place — track as follow-up work rather than assuming it exists:

- `eslint-plugin-vuejs-accessibility` wired into `frontend/eslint.config.ts`, so `npm run lint`
  catches missing `alt`, bad `role` usage, and non-semantic click handlers automatically.
- `vitest-axe` (or `axe-core` directly) in component specs, asserting no serious/critical
  violations on mount.
- A CI step running the above, so a regression fails the build rather than relying on review.
