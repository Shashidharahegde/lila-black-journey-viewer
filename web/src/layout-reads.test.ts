// Reading a layout property (offsetWidth, clientHeight, getBoundingClientRect …) while rendering or in an effect forces the
// browser to lay the page out right then; doing it after a write, on every pointer move, is layout thrashing (the map tooltip did).
// New reads must be deliberate: add the file here with the reason, or measure with ResizeObserver instead.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sources = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const READS = /\b(offsetWidth|offsetHeight|offsetTop|offsetLeft|offsetParent|clientWidth|clientHeight|scrollWidth|scrollHeight|getBoundingClientRect|getComputedStyle)\b/

/** code only: comments may talk about these names */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** files allowed to read layout, and why */
const ALLOWED: Record<string, string> = {
  './map/MapOverview.tsx': 'one read per click on the overview thumbnail',
  './ui/MatchList.tsx': 'one read to scroll the selected row into view, when the selection changes',
}

describe('layout reads', () => {
  it('only the listed files read layout; everything else measures with ResizeObserver', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .filter(([path, text]) => READS.test(code(text)) && !(path in ALLOWED))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('the map tooltip reads sizes from ResizeObserver', () => {
    const tooltip = sources['./components/map-tooltip.tsx']
    expect(tooltip).toContain('ResizeObserver')
    expect(code(tooltip)).not.toMatch(READS)
  })

  it('the page itself never scrolls: html and body are overflow hidden, so an injected element or a rounding error cannot add scrollbars', () => {
    const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
    expect(indexCss).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/)
  })
})
