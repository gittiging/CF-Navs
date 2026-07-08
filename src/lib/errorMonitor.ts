// Lightweight production error monitoring.
// Classifies runtime errors, attaches structured metadata, and patches
// console.error so the Chrome regression suite can still assert on zero
// console errors in the app-specific category.

import { isApiError, isUnauthorizedError, type ApiError } from './api'

export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'data'
  | 'scripting'
  | 'unknown'

export type ClassifiedError = {
  category: ErrorCategory
  message: string
  stack?: string
  timestamp: number
  url?: string
  line?: number
  col?: number
}

export function classifyError(error: unknown): ClassifiedError {
  const timestamp = Date.now()

  if (isApiError(error)) {
    const apiError = error as ApiError
    const category: ErrorCategory = isUnauthorizedError(error) ? 'auth' : 'data'
    return {
      category,
      message: `API ${apiError.status} code=${apiError.code}: ${apiError.message}`,
      timestamp,
    }
  }

  if (error instanceof Error) {
    const message = error.message
    let category: ErrorCategory = 'scripting'

    if (/network|fetch|timeout|abort|connection/i.test(message)) {
      category = 'network'
    } else if (/unauthorized|token|session|login|auth/i.test(message)) {
      category = 'auth'
    } else if (/validation|schema|parse|invalid|format|missing/i.test(message)) {
      category = 'data'
    }

    return {
      category,
      message,
      stack: error.stack,
      timestamp,
    }
  }

  // Unhandled rejection with a non-Error value, or other unexpected types.
  let message = 'Unknown runtime error'
  try {
    message = String(error)
  } catch {
    // Keep the default message.
  }

  return {
    category: 'unknown',
    message,
    timestamp,
  }
}

export function formatLoggableError(entry: ClassifiedError): string {
  const parts: string[] = [`[${entry.category.toUpperCase()}] ${entry.message}`]
  if (entry.url) parts.push(`url=${entry.url}`)
  if (entry.line != null) parts.push(`line=${entry.line}`)
  if (entry.col != null) parts.push(`col=${entry.col}`)
  return parts.join(' ')
}

let _originalConsoleError: typeof console.error | null = null
let _globalHandlersRegistered = false

export function registerGlobalErrorHandlers(onError?: (entry: ClassifiedError) => void): void {
  if (_globalHandlersRegistered) return
  _globalHandlersRegistered = true

  const report = (entry: ClassifiedError) => {
    if (_originalConsoleError) {
      _originalConsoleError(formatLoggableError(entry))
    }
    onError?.(entry)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      report({
        category: 'scripting',
        message: event.message || 'Uncaught script error',
        stack: event.error?.stack,
        timestamp: Date.now(),
        url: event.filename,
        line: event.lineno,
        col: event.colno,
      })
    })

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      report(classifyError(event.reason))
    })
  }
}

export function captureConsoleErrors(): void {
  if (_originalConsoleError) return
  _originalConsoleError = console.error

  console.error = (...args: unknown[]) => {
    // Always forward to the original console.error so browser DevTools
    // and the regression suite still see the output.
    _originalConsoleError?.(...args)
  }
}
