/**
 * Shared field styling for the CMS forms. Kept in one module so the scalar form and the
 * matrix-table form cannot drift apart, and so the focus convention matches
 * `BaseButton.vue` / `AppNavbar.vue` (`focus-visible:outline`) per `docs/ACCESSIBILITY.md` §4.
 */
export const INPUT_CLASSES =
  'block w-full rounded-btn border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-invalid:border-rose-500';

export const CELL_INPUT_CLASSES =
  'block w-full min-w-[7rem] rounded-btn border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-invalid:border-rose-500';

export const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 rounded-xs border-slate-300 text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy';
