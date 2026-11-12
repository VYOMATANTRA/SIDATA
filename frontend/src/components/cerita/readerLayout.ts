/**
 * Column layout shared by everything on a Cerita page (title band, notices, chapters, chapter
 * list), so they all sit on the same axis.
 *
 * - below `lg`: one column; the chapter selector is a bar under the header.
 * - `lg` to `xl`: the article fills the left track, the chapter list is a fixed track on the right.
 * - from `xl`: three tracks. The article is the middle one, so it stays centred on the page whatever
 *   the chapter list does; the chapter list sits in the right track.
 */
export const READER_GRID =
  'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_minmax(0,1fr)]';

/** The article column (text, figures, charts). Centred in its track, at a readable measure. */
export const READER_MAIN =
  'mx-auto w-full min-w-0 max-w-[44rem] lg:col-start-1 lg:row-start-1 xl:col-start-2';

/** The desktop chapter list, in the right-hand track. */
export const READER_ASIDE = 'lg:col-start-2 lg:row-start-1 xl:col-start-3';
