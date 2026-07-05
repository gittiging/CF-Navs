import type {
  Bookmark,
  BookmarkUpsertReq,
  Category,
  CategoryUpsertReq,
  IconSource,
  PublicBookmark,
} from '../../shared/types'
import type { BookmarkFormValue, CategoryFormValue } from './adminTypes'

export function toCategoryPayload(form: CategoryFormValue): CategoryUpsertReq {
  return {
    title: form.title.trim(),
    icon: form.icon.trim() || null,
  }
}

export function toBookmarkPayload(form: BookmarkFormValue): BookmarkUpsertReq {
  return {
    category_id: Number(form.category_id),
    title: form.title.trim(),
    url: form.url.trim(),
    icon: form.icon.trim() || null,
    icon_source: (form.icon_source as IconSource) || null,
    icon_background_color: form.icon_background_color.trim() || null,
    description: form.description.trim() || null,
    open_method: form.open_method === 'same_tab' ? 2 : form.open_method === 'modal' ? 3 : 1,
  }
}

export function toCategoryForm(category: Category): CategoryFormValue {
  return {
    id: category.id,
    title: category.title,
    icon: category.icon ?? '',
  }
}

export function toBookmarkForm(bookmark: Bookmark | PublicBookmark): BookmarkFormValue {
  return {
    id: bookmark.id,
    category_id: bookmark.category_id,
    title: bookmark.title,
    url: bookmark.url,
    icon: bookmark.icon ?? '',
    icon_source: bookmark.icon_source ?? '',
    icon_background_color: bookmark.icon_background_color ?? '',
    description: bookmark.description ?? '',
    open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
  }
}
