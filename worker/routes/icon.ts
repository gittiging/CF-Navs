import { Hono } from 'hono'
import type { Context } from 'hono'
import { getBookmarkIconData, getCategory, setIconBlob } from '../lib/db'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

export const iconRoutes = new Hono<HonoEnv>()

interface FetchedIcon {
  bytes: Uint8Array
  contentType: string
}

const CACHE_TIMEOUT_MS = 5000
const MAX_ICON_SIZE = 256_000
const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.1'
const SUCCESS_CACHE = 'public, max-age=604800, s-maxage=2592000, immutable'
const FAILURE_CACHE = 'no-store'
const FALLBACK_CACHE = 'public, max-age=300, s-maxage=300'

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': FAILURE_CACHE,
    },
  })
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fallbackIconResponse(title: string, url: string): Response {
  let hostname = 'NAV'
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '') || hostname
  } catch {
    hostname = 'NAV'
  }

  const text = escapeSvgText((title.trim() || hostname).slice(0, 4))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111827"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#f9fafb" font-size="180" font-weight="700" font-family="Arial,Helvetica,sans-serif">${text}</text>
</svg>`

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': FALLBACK_CACHE,
      'X-Icon-Fallback': '1',
    },
  })
}

function dataUriToResponse(dataUri: string): Response | null {
  const match = dataUri.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null

  const mime = match[1] || 'image/png'
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': SUCCESS_CACHE,
    },
  })
}

function iconBytesToResponse(icon: FetchedIcon): Response {
  const body = new ArrayBuffer(icon.bytes.byteLength)
  new Uint8Array(body).set(icon.bytes)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': icon.contentType,
      'Content-Length': String(icon.bytes.byteLength),
      'Cache-Control': SUCCESS_CACHE,
    },
  })
}

function iconBytesToDataUri(icon: FetchedIcon): string {
  let binary = ''
  for (let i = 0; i < icon.bytes.length; i += 1) {
    binary += String.fromCharCode(icon.bytes[i])
  }

  return `data:${icon.contentType};base64,${btoa(binary)}`
}

async function fetchIcon(iconUrl: string): Promise<FetchedIcon | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS)

  try {
    const response = await fetch(iconUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
      },
    })

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
    if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      return null
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_SIZE) {
      return null
    }

    return {
      bytes: new Uint8Array(buffer),
      contentType: contentType.startsWith('image/') ? contentType : 'image/png',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function cacheResponse(c: AppContext, request: Request, response: Response) {
  const executionCtx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx
  const edgeCache = (caches as unknown as { default: Cache }).default
  executionCtx?.waitUntil(edgeCache.put(request, response.clone()))
}

function normalizeIconifyParam(value: string): string {
  return decodeURIComponent(value).replace(/\.svg$/i, '').trim().toLowerCase()
}

function normalizeIconifyPair(prefix: string, name: string): string | null {
  const normalizedPrefix = prefix.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase().replace(/\.svg$/i, '')
  if (!/^[a-z0-9-]+$/.test(normalizedPrefix) || !/^[a-z0-9-]+$/.test(normalizedName)) {
    return null
  }

  return `https://api.iconify.design/${encodeURIComponent(normalizedPrefix)}/${encodeURIComponent(normalizedName)}.svg`
}

function iconifyUrlFromParams(prefixParam: string, nameParam: string): string | null {
  const prefix = normalizeIconifyParam(prefixParam)
  const name = normalizeIconifyParam(nameParam)
  return normalizeIconifyPair(prefix, name)
}

function isIconifyIconUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return false
    const iconUrl = normalizeIconifyPair(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]))
    if (!iconUrl) return false

    return (
      url.protocol === 'https:' &&
      (url.hostname === 'api.iconify.design' || url.hostname === 'icon-sets.iconify.design')
    )
  } catch {
    return false
  }
}

iconRoutes.get('/iconify/:prefix/:name', async (c) => {
  const iconUrl = iconifyUrlFromParams(c.req.param('prefix'), c.req.param('name'))
  if (!iconUrl) {
    return errorResponse('invalid iconify icon', 400)
  }

  try {
    const edgeCache = (caches as unknown as { default: Cache }).default
    const cached = await edgeCache.match(c.req.raw)
    if (cached) {
      return cached
    }

    const icon = await fetchIcon(iconUrl)
    if (!icon) {
      return fallbackIconResponse(c.req.param('name').replace(/\.svg$/i, ''), iconUrl)
    }

    const response = iconBytesToResponse(icon)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return fallbackIconResponse(c.req.param('name').replace(/\.svg$/i, ''), iconUrl)
  }
})

iconRoutes.get('/icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse('invalid id', 400)
  }

  try {
    const edgeCache = (caches as unknown as { default: Cache }).default
    const cached = await edgeCache.match(c.req.raw)
    if (cached) {
      return cached
    }

    const bookmark = await getBookmarkIconData(c.env.DB, id)
    if (bookmark?.icon_blob) {
      const response = dataUriToResponse(bookmark.icon_blob)
      if (!response) {
        await setIconBlob(c.env.DB, id, null)
      } else {
        cacheResponse(c, c.req.raw, response)
        return response
      }
    }

    if (!bookmark?.icon) {
      return fallbackIconResponse(bookmark?.title ?? '', bookmark?.url ?? '')
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon)
      const response = dataUriToResponse(bookmark.icon)
      if (!response) return fallbackIconResponse(bookmark.title, bookmark.url)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return fallbackIconResponse(bookmark.title, bookmark.url)
    }

    const fetchedIcon = await fetchIcon(bookmark.icon)
    if (!fetchedIcon) {
      return fallbackIconResponse(bookmark.title, bookmark.url)
    }

    if (isIconifyIconUrl(bookmark.icon)) {
      const response = iconBytesToResponse(fetchedIcon)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    await setIconBlob(c.env.DB, id, iconBytesToDataUri(fetchedIcon))
    const response = iconBytesToResponse(fetchedIcon)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})

iconRoutes.get('/category-icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse('invalid id', 400)
  }

  try {
    const edgeCache = (caches as unknown as { default: Cache }).default
    const cached = await edgeCache.match(c.req.raw)
    if (cached) {
      return cached
    }

    const category = await getCategory(c.env.DB, id)
    if (!category?.icon) {
      return fallbackIconResponse(category?.title ?? '', '')
    }

    if (category.icon.startsWith('data:image/')) {
      const response = dataUriToResponse(category.icon)
      if (!response) return fallbackIconResponse(category.title, '')
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(category.icon)) {
      return fallbackIconResponse(category.title, '')
    }

    const fetchedIcon = await fetchIcon(category.icon)
    if (!fetchedIcon) {
      return fallbackIconResponse(category.title, category.icon)
    }

    const response = iconBytesToResponse(fetchedIcon)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})
