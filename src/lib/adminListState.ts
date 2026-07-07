import type { AdminBookmarkSummary, AdminCategorySummary } from './appData'
import { DEFAULT_PAGE_SIZE, clampPage, pageCount, pageEnd, pageStart, slicePage } from './pagination'
import { reorderByIds } from './reorder'

type AdminSortableItem = {
  id: string | number
}

export type AdminListPage<T> = {
  page: number
  totalPages: number
  items: T[]
  start: number
  end: number
  total: number
}

export function getAdminCategoryTitle(
  categories: AdminCategorySummary[],
  categoryId: string | number,
  fallback = '未分类',
): string {
  return categories.find((category) => category.id === categoryId)?.title ?? fallback
}

export function getAdminCategoryBookmarkCount(
  category: AdminCategorySummary,
  bookmarks: AdminBookmarkSummary[],
): number {
  return category.bookmarkCount ?? bookmarks.filter((bookmark) => bookmark.category_id === category.id).length
}

export function filterAdminBookmarks(
  bookmarks: AdminBookmarkSummary[],
  categories: AdminCategorySummary[],
  search: string,
): AdminBookmarkSummary[] {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return bookmarks

  const categoryTitleById = new Map(categories.map((category) => [category.id, category.title.toLowerCase()]))

  return bookmarks.filter((bookmark) => {
    const categoryTitle = categoryTitleById.get(bookmark.category_id) ?? ''
    return (
      bookmark.title.toLowerCase().includes(normalizedSearch) ||
      bookmark.url.toLowerCase().includes(normalizedSearch) ||
      categoryTitle.includes(normalizedSearch)
    )
  })
}

export function createAdminListPage<T>(
  items: T[],
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
): AdminListPage<T> {
  const total = items.length
  const totalPages = pageCount(total, pageSize)
  const page = clampPage(requestedPage, totalPages)

  return {
    page,
    totalPages,
    items: slicePage(items, page, pageSize),
    start: pageStart(page, total, pageSize),
    end: pageEnd(page, total, pageSize),
    total,
  }
}

export function getAdminListTotalPages(total: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return pageCount(total, pageSize)
}

export function clampAdminListPage(page: number, totalPages: number): number {
  return clampPage(page, totalPages)
}

export function createAdminSortDraft<T>(items: T[]): T[] {
  return [...items]
}

export function reorderAdminSortDraft<T extends AdminSortableItem>(
  items: T[],
  orderedIds: Array<string | number>,
): T[] {
  return reorderByIds(items, orderedIds)
}

export function getAdminSortIds<T extends AdminSortableItem>(items: T[]): Array<string | number> {
  return items.map((item) => item.id)
}
