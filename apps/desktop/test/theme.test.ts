// Focus ring colour, owner decision N154 (2026-11-11, brand/README.md): the darker orange #a65f20 on light backgrounds,
// the lighter #e7a066 in dark mode, the brand orange #cf8137 everywhere else. Contrast is computed from the stylesheet;
// nothing here was looked at in the built app.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { contrastRatio } from '../../../packages/react/src/themes'

const css = readFileSync(join(__dirname, '../src/app.css'), 'utf8')
const vars = (start: string) => {
  const at = css.indexOf(start)
  expect(at, start).toBeGreaterThanOrEqual(0)
  return Object.fromEntries([...css.slice(at, css.indexOf('}', at)).matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]))
}

describe('focus ring colour (N154)', () => {
  it('is the darker orange in light, the lighter orange in dark, 3:1 or better on every background; the accent stays the brand orange', () => {
    const light = vars(':root {')
    expect(light['--focus']).toBe('#a65f20')
    expect(light['--accent']).toBe('#cf8137')
    for (const dark of [vars(':root:not('), vars(":root[data-appearance='dark'] {")]) {
      expect(dark['--focus']).toBe('#e7a066')
      for (const bg of ['--bg', '--panel', '--field']) expect(contrastRatio(dark['--focus']!, dark[bg]!), `dark focus on ${bg}`).toBeGreaterThanOrEqual(3)
    }
    for (const bg of ['--bg', '--panel', '--field']) expect(contrastRatio(light['--focus']!, light[bg]!), `light focus on ${bg}`).toBeGreaterThanOrEqual(3)
  })

  it('the shell colors match the OneOrigin tokens built into oneorigin.css, in light and both dark blocks', () => {
    // oneorigin.css is written from brand/oneorigin/tokens.json by `node scripts/oneorigin.mjs build`; CI's `check` keeps it current.
    const tokenCss = readFileSync(join(__dirname, '../src/oneorigin.css'), 'utf8')
    const tokens = (start: string) => {
      const at = tokenCss.indexOf(start)
      expect(at, start).toBeGreaterThanOrEqual(0)
      return Object.fromEntries([...tokenCss.slice(at, tokenCss.indexOf('}', at)).matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]))
    }
    const shell: Record<string, string> = { '--bg': '--op-background', '--panel': '--op-panel', '--text': '--op-text', '--muted': '--op-muted', '--border': '--op-border', '--accent': '--op-accent', '--focus': '--op-focus' }
    const pairs = [[':root {', ':root {'], [':root:not(', ':root:not('], [":root[data-appearance='dark'] {", ":root[data-appearance='dark'] {"]] as const
    for (const [app, built] of pairs) {
      const a = vars(app)
      const t = tokens(built)
      for (const [name, token] of Object.entries(shell)) expect(a[name], `${app} ${name} = ${token}`).toBe(t[token])
    }
  })

  it('a chosen appearance sets the pedigree focus ring too, and app controls use --focus', () => {
    expect(vars(":root[data-appearance='light'] :is(")['--op-focus']).toBe('#a65f20')
    expect(vars(":root[data-appearance='dark'] :is(")['--op-focus']).toBe('#e7a066')
    expect(css).toContain(':is(button, select, input, summary, a):focus-visible { outline: 2px solid var(--focus);')
  })
})
