import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/lib/api'
import { classifyError, formatLoggableError } from '../../src/lib/errorMonitor'

describe('error monitor classification', () => {
  it('classifies ApiErrors by code', () => {
    const authError = new ApiError('Unauthorized', { code: 401, status: 401 })
    const dataError = new ApiError('Bad request', { code: 400, status: 400 })

    expect(classifyError(authError)).toMatchObject({
      category: 'auth',
      message: expect.stringContaining('401'),
    })

    expect(classifyError(dataError)).toMatchObject({
      category: 'data',
      message: expect.stringContaining('400'),
    })
  })

  it('classifies Error instances by message keywords', () => {
    expect(classifyError(new Error('fetch failed'))).toMatchObject({ category: 'network' })
    expect(classifyError(new Error('Network timeout'))).toMatchObject({ category: 'network' })
    expect(classifyError(new Error('Token expired'))).toMatchObject({ category: 'auth' })
    expect(classifyError(new Error('validation schema mismatch'))).toMatchObject({ category: 'data' })
    expect(classifyError(new Error('Some generic issue'))).toMatchObject({ category: 'scripting' })
  })

  it('preserves stack traces for regular errors', () => {
    const error = new Error('test')
    const result = classifyError(error)
    expect(result.stack).toBe(error.stack)
    expect(result.timestamp).toBeGreaterThan(0)
  })

  it('classifies non-Error values as unknown', () => {
    expect(classifyError('just a string')).toMatchObject({ category: 'unknown', message: 'just a string' })
    expect(classifyError(42)).toMatchObject({ category: 'unknown', message: '42' })
    expect(classifyError(null)).toMatchObject({ category: 'unknown' })
  })

  it('formats classified errors with available metadata', () => {
    const entry = {
      category: 'network' as const,
      message: 'fetch failed',
      timestamp: 12345,
      url: '/api/icon/42',
      line: 10,
      col: 5,
    }

    const formatted = formatLoggableError(entry)
    expect(formatted).toBe('[NETWORK] fetch failed url=/api/icon/42 line=10 col=5')
  })

  it('omits optional metadata in formatted output', () => {
    const entry = {
      category: 'scripting' as const,
      message: 'runtime error',
      timestamp: 12345,
    }

    expect(formatLoggableError(entry)).toBe('[SCRIPTING] runtime error')
  })
})
