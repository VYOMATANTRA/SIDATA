/**
 * Shared field styling for the CMS forms. Kept in one module so the scalar form and the
 * matrix-table form cannot drift apart, and so the focus convention matches
 * `BaseButton.vue` / `AppNavbar.vue` (`focus-visible:outline`) per `docs/ACCESSIBILITY.md` §4.
 * Navy/white tokens only (see `docs/UI_STYLE_GUIDE.md`); the one status colour is the error border,
 * which must always be accompanied by an error message tied via `aria-describedby`.
 */
export const INPUT_CLASSES =
  'block w-full rounded-btn border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-brand-navy transition-colors placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-text-muted aria-invalid:border-status-error';

export const CELL_INPUT_CLASSES =
  'block w-full min-w-[7rem] rounded-btn border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-brand-navy transition-colors placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-text-muted aria-invalid:border-status-error';

export const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 rounded-xs border-border-strong text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';
