import type { InjectionKey } from 'vue';

/**
 * Provided by `PublicLayout` to everything rendered inside it. `TentangPageLayout` (kept as a thin
 * compatibility wrapper) reads it to know whether the shell is already around it, so a routed view
 * is never wrapped in a second navbar, footer or `<main>`.
 */
export const publicShellKey: InjectionKey<true> = Symbol('publicShell');
