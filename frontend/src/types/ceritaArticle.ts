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

export type ChartType = 'bar' | 'column';
/** `total` draws one value per row; `by_sex` draws male and female for each row. */
export type ChartSeries = 'total' | 'by_sex';

/**
 * A chart drawn from an indicator table on the same Cerita page (SPEC §8). It stores no numbers:
 * the table it names is looked up when the page is shown, so the chart follows the table.
 */
export interface ChartFigure {
  kind: 'chart';
  tableId: string;
  chartType: ChartType;
  series: ChartSeries;
  title: string;
  /** Where the numbers come from, shown under the chart. */
  source?: string;
}

/** The part of an indicator table a chart reads. An `IndicatorTableDetail` satisfies it. */
export interface ChartTable {
  id: string;
  period?: string;
  rows: {
    id: string;
    label: string;
    male: number | null;
    female: number | null;
    total: number | null;
  }[];
}

export type ArticleFigure = PhotoFigure | PhotoGroupFigure | DiagramFigure | ChartFigure;

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
  /** Indicator tables the page's charts read, by id. Only the development mockup supplies them. */
  tables?: ChartTable[];
}
