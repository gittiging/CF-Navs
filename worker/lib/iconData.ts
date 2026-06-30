import type { IconSource } from '../../shared/types'

export interface FetchedIcon {
  bytes: Uint8Array
  contentType: string
}

const CACHE_TIMEOUT_MS = 5000
const MAX_ICON_SIZE = 256_000
const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.1'
const BASE64_CHUNK_SIZE = 0x8000

function normalizeContentType(value: string | null): string {
  const contentType = value?.split(';')[0]?.trim() || 'image/png'
  return contentType.startsWith('image/') ? contentType : 'image/png'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export async function fetchCacheableIcon(iconUrl: string, timeoutMs = CACHE_TIMEOUT_MS): Promise<FetchedIcon | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(iconUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
        'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs/1.0)',
      },
    })

    if (!response.ok) return null

    const contentType = normalizeContentType(response.headers.get('content-type'))
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_SIZE) {
      return null
    }

    return {
      bytes: new Uint8Array(buffer),
      contentType,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function iconBytesToResponse(icon: FetchedIcon, cacheControl: string): Response {
  const body = new ArrayBuffer(icon.bytes.byteLength)
  new Uint8Array(body).set(icon.bytes)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': icon.contentType,
      'Content-Length': String(icon.bytes.byteLength),
      'Cache-Control': cacheControl,
    },
  })
}

export function iconBytesToDataUri(icon: FetchedIcon): string {
  return `data:${icon.contentType};base64,${bytesToBase64(icon.bytes)}`
}

export function dataUriToResponse(dataUri: string, cacheControl: string): Response | null {
  const match = dataUri.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null

  try {
    const mime = match[1] || 'image/png'
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': cacheControl,
      },
    })
  } catch {
    return null
  }
}

function normalizeIconifyPair(prefix: string, name: string): boolean {
  const normalizedPrefix = prefix.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase().replace(/\.svg$/i, '')
  return /^[a-z0-9-]+$/.test(normalizedPrefix) && /^[a-z0-9-]+$/.test(normalizedName)
}

export function isIconifyIconUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return false

    return (
      url.protocol === 'https:' &&
      (url.hostname === 'api.iconify.design' || url.hostname === 'icon-sets.iconify.design') &&
      normalizeIconifyPair(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]))
    )
  } catch {
    return false
  }
}

export function shouldPersistIconBlob(iconUrl: string, iconSource: IconSource | string | null | undefined): boolean {
  return /^https?:\/\//i.test(iconUrl) && iconSource !== 'iconify' && !isIconifyIconUrl(iconUrl)
}
