/**
 * Column layout shared by everything on a Cerita page (title band, notices, chapters, chapter
 * list), so they all sit on the same axis.
 *
 * - below `lg`: one column; the chapter selector is a bar under the header.
 * - from `lg`: the article fills the left track and the chapter list is a fixed 15rem track on the
 *   right. The article takes the whole track, so a section's text and its figure can sit side by
 *   side (`CeritaSectionBody`); its prose keeps its own measure (`max-w-prose`).
 */
export const READER_GRID =
  'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-10';

/** The article column (text, figures, charts). Narrow below `lg`; the full left track from `lg`. */
export const READER_MAIN = 'mx-auto w-full min-w-0 max-w-[44rem] lg:col-start-1 lg:row-start-1 lg:max-w-none';

/** The desktop chapter list, in the right-hand track. */
export const READER_ASIDE = 'lg:col-start-2 lg:row-start-1';
