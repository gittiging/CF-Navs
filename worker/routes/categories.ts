import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type CategoryUpsertReq, type SortReq } from '../../shared/types'
import {
  createCategory,
  deleteCategory,
  listCategories,
  sortCategories,
  touchDataVersion,
  updateCategory,
} from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { fail, ok } from '../lib/response'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

function parseId(c: AppContext): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

async function readJson<T>(c: AppContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

export const categoriesRoutes = new Hono<HonoEnv>()

categoriesRoutes.get('/', async (c) => {
  try {
    return c.json(ok(await listCategories(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list categories'))
  }
})

categoriesRoutes.post('/', async (c) => {
  const body = await readJson<CategoryUpsertReq>(c)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon)) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await createCategory(c.env.DB, {
      title: body.title.trim(),
      icon: body.icon ?? null,
    })
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to create category'))
  }
})

categoriesRoutes.put('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  const body = await readJson<CategoryUpsertReq>(c)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon)) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await updateCategory(c.env.DB, id, {
      title: body.title.trim(),
      icon: body.icon ?? null,
    })
    if (!category) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to update category'))
  }
})

categoriesRoutes.delete('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  try {
    const deleted = await deleteCategory(c.env.DB, id)
    if (!deleted) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to delete category'))
  }
})

categoriesRoutes.post('/sort', async (c) => {
  const body = await readJson<SortReq>(c)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return badRequest(c, 'invalid sort payload')
  }

  try {
    await sortCategories(c.env.DB, ids)
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to sort categories'))
  }
})

export default categoriesRoutes
