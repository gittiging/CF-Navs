import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('compact bookmark card theme styles', () => {
  it('keeps compact card titles readable in dark mode', () => {
    const source = readFileSync('src/components/BookmarkCardCompact.svelte', 'utf8')

    expect(source).toContain(":global([data-theme='dark']) .bookmark-icon-title")
    expect(source).toContain('color: var(--card-text-color, #e5eefb);')
  })
})
