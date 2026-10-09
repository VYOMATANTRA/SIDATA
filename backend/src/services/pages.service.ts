import prisma from '../utils/prisma.js';

export interface SectionDTO {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
}

export interface ChapterDTO {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  sections: SectionDTO[];
}

export interface PageSummaryDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapterCount: number;
}

export interface PageDetailDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapters: ChapterDTO[];
  createdAt: string;
  updatedAt: string;
}

export const getPages = async (): Promise<PageSummaryDTO[]> => {
  const pages = await prisma.page.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { chapters: true } } },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    sortOrder: page.sortOrder,
    chapterCount: page._count.chapters,
  }));
};

export const getPageBySlug = async (slug: string): Promise<PageDetailDTO | null> => {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      chapters: {
        orderBy: { sortOrder: 'asc' },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    sortOrder: page.sortOrder,
    chapters: page.chapters.map((chapter) => ({
      id: chapter.id,
      slug: chapter.slug,
      number: chapter.number,
      title: chapter.title,
      sortOrder: chapter.sortOrder,
      sections: chapter.sections.map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        sortOrder: section.sortOrder,
      })),
    })),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
};
