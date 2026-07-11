import type { AdminData } from '../../shared/types'
import { getStoredAuthSession } from './api'

const CACHE_NAME = 'cf-navs-admin-data-v1'
const CACHE_ORIGIN = 'https://cf-navs.local'
const CACHE_PATH_PREFIX = '/admin-data/'
const STORAGE_PREFIX = 'cf-navs.admin-data.'
const MAX_SNAPSHOT_BYTES = 1_500_000

type CachedAdminDataPayload = {
  saved_at: number
  version?: string | null
  data: AdminData
}

export interface CachedAdminDataEntry {
  version: string | null
  data: AdminData
}

function canUseCacheStorage(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && 'localStorage' in window
}

function hash(input: string): string {
  let value = 0
  for (let i = 0; i < input.length; i += 1) {
    value = Math.imul(31, value) + input.charCodeAt(i) | 0
  }
  return Math.abs(value).toString(36)
}

function currentOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'local'
}

function sessionCacheKey(): string | null {
  const session = getStoredAuthSession()
  if (!session) return null
  return `${hash(currentOrigin())}-${hash(`${session.username}:${session.token}:${session.expires_at}`)}`
}

function cacheRequest(cacheKey: string): Request {
  return new Request(`${CACHE_ORIGIN}${CACHE_PATH_PREFIX}${encodeURIComponent(cacheKey)}`, {
    method: 'GET',
  })
}

function localStorageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`
}

function isAdminDataCacheRequest(request: Request): boolean {
  try {
    const url = new URL(request.url)
    return url.origin === CACHE_ORIGIN && url.pathname.startsWith(CACHE_PATH_PREFIX)
  } catch {
    return false
  }
}

async function deleteStaleCacheStorageEntries(cache: Cache, cacheKey: string): Promise<void> {
  const currentUrl = cacheRequest(cacheKey).url
  const requests = await cache.keys()
  await Promise.all(
    requests.map((request) => (
      request.url !== currentUrl && isAdminDataCacheRequest(request)
        ? cache.delete(request)
        : Promise.resolve(false)
    )),
  )
}

function deleteStaleLocalStorageEntries(cacheKey: string): void {
  if (!canUseLocalStorage()) return

  const currentKey = localStorageKey(cacheKey)
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(STORAGE_PREFIX) && key !== currentKey) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // Best-effort cleanup.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAdminData(value: unknown): value is AdminData {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.categories) &&
    Array.isArray(value.bookmarks) &&
    isRecord(value.settings) &&
    typeof value.settings.background_preset_id === 'string'
  )
}

function parsePayload(value: unknown): CachedAdminDataEntry | null {
  if (!isRecord(value) || !isAdminData(value.data)) return null
  return {
    version: typeof value.version === 'string' ? value.version : null,
    data: value.data,
  }
}

async function readCacheStorage(cacheKey: string): Promise<CachedAdminDataEntry | null> {
  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(cacheRequest(cacheKey))
    if (!cached) return null
    return parsePayload(await cached.json())
  } catch {
    return null
  }
}

function readLocalStorage(cacheKey: string): CachedAdminDataEntry | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = localStorage.getItem(localStorageKey(cacheKey))
    if (!raw) return null
    return parsePayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function readCachedAdminData(): Promise<AdminData | null> {
  return (await readCachedAdminDataEntry())?.data ?? null
}

export async function readCachedAdminDataEntry(): Promise<CachedAdminDataEntry | null> {
  const cacheKey = sessionCacheKey()
  if (!cacheKey) return null

  deleteStaleLocalStorageEntries(cacheKey)
  if (canUseCacheStorage()) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await deleteStaleCacheStorageEntries(cache, cacheKey)
    } catch {
      // Best-effort cleanup.
    }
  }

  return readLocalStorage(cacheKey) ?? await readCacheStorage(cacheKey)
}

export async function writeCachedAdminData(data: AdminData, version: string | null = null): Promise<void> {
  const cacheKey = sessionCacheKey()
  if (!cacheKey || !data.settings) return

  const payload: CachedAdminDataPayload = {
    saved_at: Date.now(),
    version,
    data,
  }
  const serialized = JSON.stringify(payload)

  if (serialized.length > MAX_SNAPSHOT_BYTES) {
    await clearCachedAdminData()
    return
  }

  if (canUseLocalStorage()) {
    try {
      deleteStaleLocalStorageEntries(cacheKey)
      localStorage.setItem(localStorageKey(cacheKey), serialized)
      if (canUseCacheStorage()) {
        const cache = await caches.open(CACHE_NAME)
        await deleteStaleCacheStorageEntries(cache, cacheKey)
        await cache.delete(cacheRequest(cacheKey))
      }
      return
    } catch {
      // Quota/private mode failures should not block the app.
    }
  }

  if (canUseCacheStorage()) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await deleteStaleCacheStorageEntries(cache, cacheKey)
      await cache.put(cacheRequest(cacheKey), new Response(serialized, {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }))
    } catch {
      // Browser cache persistence is best-effort.
    }
  }
}

export async function clearCachedAdminData(): Promise<void> {
  if (canUseCacheStorage()) {
    try {
      await caches.delete(CACHE_NAME)
    } catch {
      // Best-effort cleanup.
    }
  }

  if (canUseLocalStorage()) {
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (key?.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key)
        }
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}
