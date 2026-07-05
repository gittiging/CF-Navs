import { describe, expect, it } from 'vitest'
import { ErrCode, type PublicBookmark, type PublicCategory } from '../../shared/types'
import { ApiError } from '../../src/lib/api'
import { toBookmarkPayload, toCategoryPayload } from '../../src/lib/adminFormAdapters'
import { buildBookmarkSubmitPayload, createBookmarkFormValue, getIconifySearchQuery } from '../../src/lib/bookmarkFormIcons'
import { createIconVersion, getBookmarkFallbackIcon, getBookmarkIconUrl } from '../../src/lib/bookmarkIconDisplay'
import {
  bookmarkMatchesSearch,
  createHomeDataMemo,
  getHomeSections,
  getVisibleCategoryIds,
  groupBookmarksByCategory,
  normalizeSearchQuery,
} from '../../src/lib/homeData'
import { clampPage, pageCount, pageEnd, pageStart, slicePage } from '../../src/lib/pagination'
import { isPublicModeForbidden, siteConfigFromForbiddenError } from '../../src/lib/publicMode'
import { reorderByIds } from '../../src/lib/reorder'

const categoryA: PublicCategory = {
  id: 1,
  title: 'Tools',
  icon: null,
  sort: 2,
}

const categoryB: PublicCategory = {
  id: 2,
  title: 'Docs',
  icon: null,
  sort: 1,
}

const bookmarkA: PublicBookmark = {
  id: 10,
  category_id: 1,
  title: 'GitHub',
  url: 'https://github.com',
  icon: null,
  icon_source: null,
  icon_background_color: null,
  icon_blob: null,
  icon_cached: null,
  description: 'Code hosting',
  open_method: 1,
  sort: 2,
}

const bookmarkB: PublicBookmark = {
  id: 11,
  category_id: 2,
  title: 'Svelte Docs',
  url: 'https://svelte.dev/docs',
  icon: 'mdi:book',
  icon_source: 'iconify',
  icon_background_color: null,
  icon_blob: null,
  icon_cached: true,
  description: null,
  open_method: 3,
  sort: 1,
}

describe('refactored helper modules', () => {
  it('paginates and reorders list data predictably', () => {
    expect(pageCount(21, 10)).toBe(3)
    expect(clampPage(9, 3)).toBe(3)
    expect(slicePage([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4])
    expect(pageStart(2, 5, 2)).toBe(3)
    expect(pageEnd(2, 5, 2)).toBe(4)
    expect(reorderByIds([{ id: 1 }, { id: 2 }, { id: 3 }], [3, 1])).toEqual([{ id: 3 }, { id: 1 }])
  })

  it('builds home sorting, grouping, and search indexes outside the view', () => {
    const memo = createHomeDataMemo()
    const sortedCategories = memo.getSortedCategories([categoryA, categoryB])
    const sortedBookmarks = memo.getSortedBookmarks([bookmarkA, bookmarkB])
    const titleMap = memo.getCategoryTitleMap(sortedCategories)
    const searchIndex = memo.getSearchIndex(sortedBookmarks, sortedCategories, titleMap)
    const grouped = groupBookmarksByCategory(sortedBookmarks)

    expect(sortedCategories.map((category) => category.id)).toEqual([2, 1])
    expect(sortedBookmarks.map((bookmark) => bookmark.id)).toEqual([11, 10])
    expect(bookmarkMatchesSearch(bookmarkA, normalizeSearchQuery('tools'), searchIndex)).toBe(true)
    expect(getVisibleCategoryIds([bookmarkB])).toEqual(new Set([2]))
    expect(getHomeSections(sortedCategories, grouped)).toEqual([
      { id: 'category-2', title: 'Docs', count: 1 },
      { id: 'category-1', title: 'Tools', count: 1 },
    ])
  })

  it('normalizes admin form values and payloads', () => {
    expect(toCategoryPayload({ title: '  Tools  ', icon: '  tool  ' })).toEqual({
      title: 'Tools',
      icon: 'tool',
    })

    expect(toBookmarkPayload({
      category_id: '2',
      title: '  Docs  ',
      url: ' https://example.com ',
      icon: '  mdi:book  ',
      icon_source: 'iconify',
      icon_background_color: '  #fff  ',
      description: '  Help  ',
      open_method: 'modal',
    })).toMatchObject({
      category_id: 2,
      title: 'Docs',
      icon: 'mdi:book',
      icon_source: 'iconify',
      open_method: 3,
    })
  })

  it('keeps bookmark edit icon behavior in pure helpers', () => {
    const form = createBookmarkFormValue({ title: '  Site  ', url: ' https://example.com ', icon: '  TXT  ' }, 9)

    expect(form.category_id).toBe(9)
    expect(getIconifySearchQuery(' mdi:home ')).toBe('mdi:home')
    expect(getIconifySearchQuery('x')).toBe('')
    expect(buildBookmarkSubmitPayload(form, '')).toMatchObject({
      title: 'Site',
      url: 'https://example.com',
      icon: 'TXT',
      icon_source: 'custom',
    })
  })

  it('centralizes bookmark icon URL and public-mode error helpers', () => {
    expect(createIconVersion('same-input')).toBe(createIconVersion('same-input'))
    expect(getBookmarkIconUrl(bookmarkB)).toContain('/api/iconify/mdi/book.svg')
    expect(getBookmarkFallbackIcon({ ...bookmarkA, icon: 'https://example.com/icon.png' }, 'bookmark')).toBe('bookmark')

    const error = new ApiError('forbidden', {
      code: ErrCode.FORBIDDEN,
      data: { site_title: 'Private Nav', public_mode: false },
    })

    expect(isPublicModeForbidden(error)).toBe(true)
    expect(siteConfigFromForbiddenError(error)).toEqual({ site_title: 'Private Nav', public_mode: false })
  })
})
