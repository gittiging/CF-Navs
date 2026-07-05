import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type IconifyCandidate, type IconifySearchResp } from '../../shared/types'
import { getBookmarkIconData, getCategory, setIconBlob } from '../lib/db'
import {
  dataUriToResponse,
  fetchCacheableIcon,
  iconBytesToDataUri,
  iconBytesToResponse,
  isIconifyIconUrl,
} from '../lib/iconData'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

export const iconRoutes = new Hono<HonoEnv>()

const SUCCESS_CACHE = 'public, max-age=604800, s-maxage=2592000, immutable'
const FAILURE_CACHE = 'no-store'
const FALLBACK_CACHE = 'public, max-age=300, s-maxage=300'
const ICONIFY_SEARCH_CACHE_MS = 10 * 60 * 1000
const ICONIFY_SEARCH_LIMIT = 64
const ICONIFY_SEARCH_RESULT_LIMIT = 8
const ICONIFY_SVG_INSPECT_LIMIT = 24
const ICONIFY_FETCH_CONCURRENCY = 8
const ICONIFY_SEARCH_TIMEOUT_MS = 4000
const ICONIFY_ICON_FETCH_TIMEOUT_MS = 1800

type IconifyCollectionInfo = {
  name?: string
  palette?: boolean
}

type IconifySearchApiResponse = {
  icons?: unknown
  collections?: Record<string, IconifyCollectionInfo>
}

type CachedIconifySearch = {
  expires: number
  data: IconifySearchResp
}

type IconifySearchWorkItem = {
  name: string
  prefix: string
  icon: string
  palette: boolean
  collection: string
  order: number
}

type IconifyInspectedCandidate = IconifyCandidate & {
  palette: boolean
  order: number
}

const iconifySearchCache = new Map<string, CachedIconifySearch>()

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

function cacheResponse(c: AppContext, request: Request, response: Response) {
  const executionCtx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx
  const edgeCache = (caches as unknown as { default: Cache }).default
  executionCtx?.waitUntil(edgeCache.put(request, response.clone()))
}

function cachedFallbackIconResponse(c: AppContext, request: Request, title: string, url: string): Response {
  const response = fallbackIconResponse(title, url)
  cacheResponse(c, request, response)
  return response
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

function normalizeIconifyNamePair(prefix: string, name: string): string | null {
  const normalizedPrefix = prefix.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase().replace(/\.svg$/i, '')
  if (!/^[a-z0-9-]+$/.test(normalizedPrefix) || !/^[a-z0-9-]+$/.test(normalizedName)) {
    return null
  }

  return `${normalizedPrefix}:${normalizedName}`
}

function normalizeIconifySearchQuery(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''

  const withoutUrl = iconifyNameFromKnownHost(trimmed) ?? trimmed
  const normalized = withoutUrl
    .replace(/^iconify:/, '')
    .replace(/^@iconify-json\//, '')
    .replace(/^@iconify-icons\//, '')
    .replace(/\s+/g, '')
    .replace(/\/+$/g, '')
    .replace(/\//g, ':')

  if (/^[a-z0-9-]+:[a-z0-9-]+$/.test(normalized)) {
    return normalized
  }

  const plain = normalized.replace(/[^a-z0-9-]/g, '')
  return plain.length >= 2 && plain.length <= 80 ? plain : ''
}

function iconifyNameFromKnownHost(value: string): string | null {
  const withoutScheme = value.trim().toLowerCase().replace(/^https?:\/\//, '')
  const pathOnly = withoutScheme.split(/[?#]/, 1)[0]
  const parts = pathOnly.split('/').filter(Boolean)
  const host = parts[0]

  if (host !== 'api.iconify.design' && host !== 'icon-sets.iconify.design') {
    return null
  }

  if (parts.length < 3) return null
  return normalizeIconifyNamePair(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]))
}

function iconifyUrlFromName(name: string): string | null {
  const parts = name.split(':')
  if (parts.length !== 2) return null
  return normalizeIconifyPair(parts[0], parts[1])
}

function iconifyUrlFromParams(prefixParam: string, nameParam: string): string | null {
  const prefix = normalizeIconifyParam(prefixParam)
  const name = normalizeIconifyParam(nameParam)
  return normalizeIconifyPair(prefix, name)
}

function iconifyProxyPath(prefix: string, icon: string): string {
  return `/api/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(icon)}.svg`
}

function iconifyProxyRequest(c: AppContext, prefix: string, icon: string): Request {
  const requestUrl = new URL(c.req.url)
  requestUrl.pathname = iconifyProxyPath(prefix, icon)
  requestUrl.search = ''
  return new Request(requestUrl.toString(), {
    method: 'GET',
  })
}

function getCachedIconifySearch(query: string): IconifySearchResp | null {
  const cached = iconifySearchCache.get(query)
  if (!cached) return null

  if (cached.expires <= Date.now()) {
    iconifySearchCache.delete(query)
    return null
  }

  return cached.data
}

function setCachedIconifySearch(query: string, data: IconifySearchResp) {
  if (iconifySearchCache.size > 100) {
    for (const [key, cached] of iconifySearchCache) {
      if (cached.expires <= Date.now() || iconifySearchCache.size > 80) {
        iconifySearchCache.delete(key)
      }
    }
  }

  iconifySearchCache.set(query, {
    expires: Date.now() + ICONIFY_SEARCH_CACHE_MS,
    data,
  })
}

async function fetchIconifySearchApi(query: string): Promise<IconifySearchApiResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ICONIFY_SEARCH_TIMEOUT_MS)

  try {
    const url = new URL('https://api.iconify.design/search')
    url.searchParams.set('query', query)
    url.searchParams.set('limit', String(ICONIFY_SEARCH_LIMIT))

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
    if (!response.ok) return null

    return (await response.json()) as IconifySearchApiResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function buildIconifyWorkItems(query: string, payload: IconifySearchApiResponse): IconifySearchWorkItem[] {
  const collections = payload.collections ?? {}
  const seen = new Set<string>()
  const names: string[] = []

  if (/^[a-z0-9-]+:[a-z0-9-]+$/.test(query)) {
    names.push(query)
  }

  if (Array.isArray(payload.icons)) {
    for (const icon of payload.icons) {
      if (typeof icon === 'string') {
        names.push(icon)
      }
    }
  }

  const items: IconifySearchWorkItem[] = []
  for (const rawName of names) {
    const [rawPrefix, rawIcon] = rawName.split(':')
    const normalizedName = normalizeIconifyNamePair(rawPrefix ?? '', rawIcon ?? '')
    if (!normalizedName || seen.has(normalizedName)) continue
    seen.add(normalizedName)

    const [prefix, icon] = normalizedName.split(':')
    const collection = collections[prefix]
    items.push({
      name: normalizedName,
      prefix,
      icon,
      palette: Boolean(collection?.palette),
      collection: collection?.name || prefix,
      order: items.length,
    })
  }

  return items.sort((a, b) => Number(b.palette) - Number(a.palette) || a.order - b.order)
}

function extractSvgText(bytes: Uint8Array, contentType: string): string {
  if (!contentType.includes('svg')) return ''

  try {
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.replace(/^#/, '').trim()
  if (/^[0-9a-f]{3}$/i.test(hex) || /^[0-9a-f]{4}$/i.test(hex)) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ]
  }

  if (/^[0-9a-f]{6}$/i.test(hex) || /^[0-9a-f]{8}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ]
  }

  return null
}

function parseRgbColor(value: string): [number, number, number] | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/i)
  if (!match) return null

  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null

  return [
    Math.max(0, Math.min(255, parts[0])),
    Math.max(0, Math.min(255, parts[1])),
    Math.max(0, Math.min(255, parts[2])),
  ]
}

function parseNamedColor(value: string): [number, number, number] | null {
  const colors: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    red: [255, 0, 0],
    orange: [255, 165, 0],
    yellow: [255, 255, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    purple: [128, 0, 128],
    pink: [255, 192, 203],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
  }

  return colors[value.toLowerCase()] ?? null
}

function parseCssColor(value: string): [number, number, number] | null {
  const normalized = value.trim().toLowerCase()
  if (
    !normalized ||
    normalized === 'none' ||
    normalized === 'transparent' ||
    normalized === 'currentcolor' ||
    normalized === 'inherit' ||
    normalized.startsWith('url(') ||
    normalized.startsWith('var(')
  ) {
    return null
  }

  if (normalized.startsWith('#')) return parseHexColor(normalized)
  if (normalized.startsWith('rgb')) return parseRgbColor(normalized)
  return parseNamedColor(normalized)
}

function isPerceptiblyColored(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb.map((channel) => channel / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1))

  return saturation >= 0.18 && lightness >= 0.08 && lightness <= 0.92
}

function svgHasColor(svg: string): boolean {
  const values: string[] = []
  const attrPattern = /\b(?:fill|stroke|stop-color|color)=["']([^"']+)["']/gi
  const stylePattern = /\b(?:fill|stroke|stop-color|color)\s*:\s*([^;"'}]+)/gi
  let match: RegExpExecArray | null

  while ((match = attrPattern.exec(svg)) !== null) {
    values.push(match[1])
  }

  while ((match = stylePattern.exec(svg)) !== null) {
    values.push(match[1])
  }

  return values.some((value) => {
    const color = parseCssColor(value)
    return color ? isPerceptiblyColored(color) : false
  })
}

function createIconifyCandidate(item: IconifySearchWorkItem, colored: boolean): IconifyCandidate {
  return {
    name: item.name,
    prefix: item.prefix,
    icon: item.icon,
    label: item.name,
    collection: item.collection,
    url: `https://api.iconify.design/${encodeURIComponent(item.prefix)}/${encodeURIComponent(item.icon)}.svg`,
    preview_url: iconifyProxyPath(item.prefix, item.icon),
    colored,
  }
}

async function inspectIconifyCandidate(c: AppContext, item: IconifySearchWorkItem): Promise<IconifyInspectedCandidate | null> {
  const iconUrl = iconifyUrlFromName(item.name)
  if (!iconUrl) return null

  const icon = await fetchCacheableIcon(iconUrl, ICONIFY_ICON_FETCH_TIMEOUT_MS)
  if (!icon) return null

  const svg = extractSvgText(icon.bytes, icon.contentType)
  const colored = svg ? svgHasColor(svg) : false
  const response = iconBytesToResponse(icon, SUCCESS_CACHE)
  cacheResponse(c, iconifyProxyRequest(c, item.prefix, item.icon), response)

  return {
    ...createIconifyCandidate(item, colored),
    palette: item.palette,
    order: item.order,
  }
}

async function inspectIconifyCandidates(c: AppContext, items: IconifySearchWorkItem[]): Promise<IconifyInspectedCandidate[]> {
  const results: IconifyInspectedCandidate[] = []

  for (let offset = 0; offset < items.length; offset += ICONIFY_FETCH_CONCURRENCY) {
    const batch = items.slice(offset, offset + ICONIFY_FETCH_CONCURRENCY)
    const inspected = await Promise.all(batch.map((item) => inspectIconifyCandidate(c, item)))
    for (const candidate of inspected) {
      if (candidate) results.push(candidate)
    }

    if (results.filter((candidate) => candidate.colored).length >= ICONIFY_SEARCH_RESULT_LIMIT) {
      break
    }
  }

  return results
}

function rankIconifyCandidates(candidates: IconifyInspectedCandidate[]): IconifyCandidate[] {
  return candidates
    .sort((a, b) => {
      return (
        Number(b.colored) - Number(a.colored) ||
        Number(b.palette) - Number(a.palette) ||
        a.order - b.order
      )
    })
    .slice(0, ICONIFY_SEARCH_RESULT_LIMIT)
    .map(({ palette: _palette, order: _order, ...candidate }) => candidate)
}

iconRoutes.get('/iconify-search', async (c) => {
  const query = normalizeIconifySearchQuery(c.req.query('query') ?? '')
  if (!query) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid iconify query'), 400)
  }

  const cached = getCachedIconifySearch(query)
  if (cached) {
    const response = c.json(ok(cached))
    response.headers.set('Cache-Control', 'private, max-age=300')
    return response
  }

  const payload = await fetchIconifySearchApi(query)
  if (!payload) {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to search iconify icons'), 502)
  }

  const items = buildIconifyWorkItems(query, payload)
  const inspected = await inspectIconifyCandidates(c, items.slice(0, ICONIFY_SVG_INSPECT_LIMIT))
  const data: IconifySearchResp = {
    query,
    candidates: rankIconifyCandidates(inspected),
  }

  setCachedIconifySearch(query, data)
  const response = c.json(ok(data))
  response.headers.set('Cache-Control', 'private, max-age=300')
  return response
})

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

    const icon = await fetchCacheableIcon(iconUrl)
    if (!icon) {
      return cachedFallbackIconResponse(c, c.req.raw, c.req.param('name').replace(/\.svg$/i, ''), iconUrl)
    }

    const response = iconBytesToResponse(icon, SUCCESS_CACHE)
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
      const response = dataUriToResponse(bookmark.icon_blob, SUCCESS_CACHE)
      if (!response) {
        await setIconBlob(c.env.DB, id, null)
      } else {
        cacheResponse(c, c.req.raw, response)
        return response
      }
    }

    if (!bookmark?.icon) {
      return cachedFallbackIconResponse(c, c.req.raw, bookmark?.title ?? '', bookmark?.url ?? '')
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon)
      const response = dataUriToResponse(bookmark.icon, SUCCESS_CACHE)
      if (!response) return cachedFallbackIconResponse(c, c.req.raw, bookmark.title, bookmark.url)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return cachedFallbackIconResponse(c, c.req.raw, bookmark.title, bookmark.url)
    }

    const fetchedIcon = await fetchCacheableIcon(bookmark.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, c.req.raw, bookmark.title, bookmark.url)
    }

    if (isIconifyIconUrl(bookmark.icon)) {
      const response = iconBytesToResponse(fetchedIcon, SUCCESS_CACHE)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    await setIconBlob(c.env.DB, id, iconBytesToDataUri(fetchedIcon))
    const response = iconBytesToResponse(fetchedIcon, SUCCESS_CACHE)
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
      return cachedFallbackIconResponse(c, c.req.raw, category?.title ?? '', '')
    }

    if (category.icon.startsWith('data:image/')) {
      const response = dataUriToResponse(category.icon, SUCCESS_CACHE)
      if (!response) return cachedFallbackIconResponse(c, c.req.raw, category.title, '')
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(category.icon)) {
      return cachedFallbackIconResponse(c, c.req.raw, category.title, '')
    }

    const fetchedIcon = await fetchCacheableIcon(category.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, c.req.raw, category.title, category.icon)
    }

    const response = iconBytesToResponse(fetchedIcon, SUCCESS_CACHE)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})
