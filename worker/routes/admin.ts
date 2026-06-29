import { Hono } from 'hono'
import { ErrCode } from '../../shared/types'
import { getAdminData } from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const adminRoutes = new Hono<HonoEnv>()

adminRoutes.get('/data', async (c) => {
  try {
    const data = await getAdminData(c.env.DB)

    return c.json(ok(data), 200, {
      'Cache-Control': 'no-store',
    })
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to load admin data'))
  }
})

export default adminRoutes
