/**
 * The shape of a Cerita page as the article template renders it (SPEC §8, "Cerita reader").
 * A page holds chapters; a chapter holds sections; a section has one heading, its paragraphs and,
 * optionally, one figure. The live reader does not build a `CeritaArticle`; it shares the figure
 * types: `utils/ceritaStoredFigure.ts` maps a stored figure block to an `ArticleFigure`.
 */

/** One photo with its caption and credit. */
export interface ArticlePhoto {
  id: string;
  /** Path or HTTPS URL. A photo without a usable address is left out. */
  src: string;
  /** What the photo shows, for people who cannot see it. */
  alt: string;
  /** Short label such as "Foto 1", or a caption. */
  caption?: string;
  /** Who took it or who it belongs to. */
  credit?: string;
}

/** A single picture. */
export interface PhotoFigure {
  kind: 'photo';
  photo: ArticlePhoto;
}

/** Several pictures: two are shown as an offset pair, more than two as a swipeable row. */
export interface PhotoGroupFigure {
  kind: 'photos';
  photos: ArticlePhoto[];
}

/** A plot or diagram: a title, the picture (or live bars) and its source. */
export interface DiagramFigure {
  kind: 'diagram';
  title: string;
  /** Picture of the plot. Either this or `bars` is shown. */
  src?: string;
  alt?: string;
  bars?: { unit?: string; items: { id: string; label: string; value: number }[] };
  /** Where the numbers come from, shown under the diagram. */
  source?: string;
}

export type ArticleFigure = PhotoFigure | PhotoGroupFigure | DiagramFigure;

export interface ArticleSection {
  id: string;
  heading: string;
  paragraphs: string[];
  figure?: ArticleFigure;
}

/** Optional authorship line under the headline. */
export interface ArticleByline {
  author: string;
  affiliation?: string;
}

export interface ArticleChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sections: ArticleSection[];
}

export interface CeritaArticle {
  /** Topic title (the page title), e.g. "Pendidikan". */
  title: string;
  /** Optional editorial headline shown as the page heading. */
  headline?: string;
  byline?: ArticleByline;
  chapters: ArticleChapter[];
}
