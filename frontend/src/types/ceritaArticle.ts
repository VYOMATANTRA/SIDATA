/**
 * Extra article content a Cerita section can carry beyond prose, indicators and matrix tables
 * (SPEC §8, "Cerita reader"). These are the shapes the reader's template renders; nothing in the
 * backend produces them yet, so a page that supplies none looks exactly as before. Wave 4
 * (Cerita management) maps stored content onto these types.
 */

export interface ArticleFigureBlock {
  kind: 'figure';
  id: string;
  /** Path or HTTPS URL of the photo. A figure without one is not rendered at all. */
  src: string;
  /** What the photo shows, for people who cannot see it. */
  alt: string;
  caption?: string;
  /** Who took it or who it belongs to. */
  credit?: string;
}

export interface ArticleQuoteBlock {
  kind: 'quote';
  id: string;
  text: string;
  attribution?: string;
}

export interface ArticleStatItem {
  id: string;
  /** Already formatted for display, e.g. "7.500". */
  value: string;
  unit?: string;
  label: string;
}

export interface ArticleStatsBlock {
  kind: 'stats';
  id: string;
  title: string;
  items: ArticleStatItem[];
}

export interface ArticleProseBlock {
  kind: 'prose';
  id: string;
  /** One entry per paragraph. */
  paragraphs: string[];
}

export interface ArticleBarsBlock {
  kind: 'bars';
  id: string;
  title: string;
  unit?: string;
  items: { id: string; label: string; value: number }[];
}

export type ArticleBlock =
  ArticleProseBlock | ArticleFigureBlock | ArticleQuoteBlock | ArticleStatsBlock | ArticleBarsBlock;

/** Optional authorship line under the headline. */
export interface ArticleByline {
  author: string;
  affiliation?: string;
}

/**
 * One Cerita page as the article template renders it: an ordered list of blocks per chapter.
 * Wave 4 builds this from the stored page, chapters, sections and their content.
 */
export interface CeritaArticle {
  /** Topic title (the page title), e.g. "Pendidikan". */
  title: string;
  /** Optional editorial headline shown as the page heading. */
  headline?: string;
  byline?: ArticleByline;
  chapters: {
    id: string;
    slug: string;
    number: string | null;
    title: string;
    blocks: ArticleBlock[];
  }[];
}
