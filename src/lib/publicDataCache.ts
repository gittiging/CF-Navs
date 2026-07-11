import type { PublicData } from '../../shared/types'

const CACHE_NAME = 'cf-navs-public-data-v1'
const CACHE_ORIGIN = 'https://cf-navs.local'
const STORAGE_PREFIX = 'cf-navs.public-data.'
const MAX_SNAPSHOT_BYTES = 1_500_000

type CachedPublicDataPayload = {
  saved_at: number
  version?: string | null
  data: PublicData
}

export interface CachedPublicDataEntry {
  version: string | null
  data: PublicData
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

function cacheKey(): string {
  return hash(currentOrigin())
}

function cacheRequest(key: string): Request {
  return new Request(`${CACHE_ORIGIN}/public-data/${encodeURIComponent(key)}`, {
    method: 'GET',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPublicData(value: unknown): value is PublicData {
  if (!isRecord(value)) return false
  return Array.isArray(value.categories) && Array.isArray(value.bookmarks) && isRecord(value.settings)
}

function parsePayload(value: unknown): CachedPublicDataEntry | null {
  if (!isRecord(value) || !isPublicData(value.data)) return null
  return {
    version: typeof value.version === 'string' ? value.version : null,
    data: value.data,
  }
}

async function readCacheStorage(key: string): Promise<CachedPublicDataEntry | null> {
  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(cacheRequest(key))
    if (!cached) return null
    return parsePayload(await cached.json())
  } catch {
    return null
  }
}

function readLocalStorage(key: string): CachedPublicDataEntry | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return null
    return parsePayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function readCachedPublicDataEntry(): Promise<CachedPublicDataEntry | null> {
  const key = cacheKey()
  return readLocalStorage(key) ?? await readCacheStorage(key)
}

export async function writeCachedPublicData(data: PublicData, version: string | null = null): Promise<void> {
  const key = cacheKey()
  const payload: CachedPublicDataPayload = {
    saved_at: Date.now(),
    version,
    data,
  }
  const serialized = JSON.stringify(payload)

  if (serialized.length > MAX_SNAPSHOT_BYTES) {
    await clearCachedPublicData()
    return
  }

  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized)
      if (canUseCacheStorage()) {
        const cache = await caches.open(CACHE_NAME)
        await cache.delete(cacheRequest(key))
      }
      return
    } catch {
      // Quota/private mode failures should not block the app.
    }
  }

  if (canUseCacheStorage()) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(cacheRequest(key), new Response(serialized, {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }))
    } catch {
      // Browser cache persistence is best-effort.
    }
  }
}

export async function clearCachedPublicData(): Promise<void> {
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
