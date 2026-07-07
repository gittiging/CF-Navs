import type { AdminData, BackupData, ImportResp } from '../../shared/types'

export const BACKUP_VERSION = 1

export function createBackupPayload(
  data: Pick<AdminData, 'categories' | 'bookmarks' | 'settings'>,
  exportedAt = Date.now(),
): BackupData {
  return {
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    categories: data.categories,
    bookmarks: data.bookmarks,
    settings: data.settings,
  }
}

export function createBackupFileName(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  return `cf-navs-backup-${stamp}.json`
}

export function createBackupExportMessage(payload: Pick<BackupData, 'categories' | 'bookmarks'>): string {
  return `已导出 ${payload.categories.length} 个分类、${payload.bookmarks.length} 个书签。`
}

export function createImportSuccessMessage(result: Pick<ImportResp, 'categories' | 'bookmarks'>): string {
  return `导入成功：${result.categories} 个分类、${result.bookmarks} 个书签。`
}
