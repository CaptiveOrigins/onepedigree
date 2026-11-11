// @vitest-environment jsdom
import { layoutSync, PEDIGREE_VIEWS, projectPedigree } from '@captiveorigins/onepedigree-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { humanFamily } from '../../../fixtures'
import { contrastRatio, PedigreeExplorer, PedigreeView, presetTheme, resolveThemeColors, THEME_PRESETS, THEME_TOKENS, ThemeEditor, themeStyle } from '../src'

afterEach(cleanup)
const projection = projectPedigree(humanFamily, { focalId: 'gwen', view: 'maternal' })
const layout = layoutSync(projection)

describe('themes', () => {
  it('ships several complete presets with per-view accents', () => {
    expect(THEME_PRESETS.map((t) => t.id)).toEqual(['classic', 'midnight', 'forest', 'ocean', 'terracotta', 'high-contrast', 'print'])
    for (const t of THEME_PRESETS) for (const k of THEME_TOKENS) expect(t.colors[k], `${t.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/)
    const classic = presetTheme('classic')!
    expect(resolveThemeColors(classic, 'maternal').connector).not.toBe(resolveThemeColors(classic, 'paternal').connector)
    expect(resolveThemeColors(classic, 'pedigree').connector).toBe(classic.colors.connector)
  })

  it('keeps preset text readable on its cards', () => {
    for (const t of THEME_PRESETS)
      for (const view of PEDIGREE_VIEWS) {
        const c = resolveThemeColors(t, view)
        expect(contrastRatio(c.label, c.nodeBackground), `${t.id} ${view}`).toBeGreaterThanOrEqual(4.5)
      }
  })

  it('ignores invalid hex values and renders the theme as custom properties (server rendering)', () => {
    const custom = { ...structuredClone(presetTheme('ocean')!), colors: { ...presetTheme('ocean')!.colors, label: 'red', connector: '#abc' } }
    expect(resolveThemeColors(custom, 'pedigree')).toMatchObject({ label: presetTheme('ocean')!.colors.label, connector: '#abc' })
    expect(themeStyle(undefined, 'pedigree')).toBeUndefined()
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} theme="forest" />)
    expect(html).toContain('data-theme="forest"')
    expect(html).toContain(`--op-node-border:${resolveThemeColors('forest', 'maternal').nodeBorder}`)
  })
})

describe('focus ring (owner decision N154, 2026-11-11)', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
  const darkAt = css.indexOf('@media (prefers-color-scheme: dark) {\n  .op-root, .op-explorer, .op-studbook')
  const focusOf = (text: string) => /--op-focus: (#[0-9a-f]{6})/.exec(text)?.[1]

  it('is the darker orange on light backgrounds, 3:1 or better on every preset card; dark keeps the lighter orange', () => {
    expect(darkAt).toBeGreaterThan(0)
    const light = focusOf(css.slice(0, darkAt))!
    const dark = focusOf(css.slice(darkAt))!
    expect(light).toBe('#a65f20')
    expect(dark).toBe('#e7a066')
    for (const t of THEME_PRESETS.filter((p) => p.id !== 'midnight')) expect(contrastRatio(light, t.colors.nodeBackground), `${t.id}`).toBeGreaterThanOrEqual(3)
    // The one dark preset passes with either ring, since the ring follows the system, not the preset.
    for (const ring of [light, dark]) expect(contrastRatio(ring, presetTheme('midnight')!.colors.nodeBackground)).toBeGreaterThanOrEqual(3)
  })

  it('every focus style draws with --op-focus, not the selection color or a fixed color', () => {
    const rules = [...css.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)].map((m) => m[1]!).filter((body) => /outline:|stroke:/.test(body))
    expect(rules.length).toBeGreaterThanOrEqual(4)
    for (const body of rules) expect(body).toMatch(/(outline: 2px solid|stroke:) var\(--op-focus\);/)
    expect(css).not.toContain('#cf8137')
  })
})

describe('theme editor', () => {
  it('changes a color by hex code for all views or only the current one, and flags invalid input', () => {
    const onChange = vi.fn()
    render(<ThemeEditor value={structuredClone(presetTheme('classic')!)} view="maternal" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Lines'), { target: { value: '#123456' } })
    expect(onChange.mock.lastCall![0].colors.connector).toBe('#123456')
    fireEvent.click(screen.getByLabelText(/This view only/))
    fireEvent.change(screen.getByLabelText('Highlight'), { target: { value: '#ABCDEF' } })
    expect(onChange.mock.lastCall![0].views.maternal.highlight).toBe('#abcdef')
    const calls = onChange.mock.calls.length
    fireEvent.change(screen.getByLabelText('Card'), { target: { value: '#12' } })
    expect(onChange.mock.calls.length).toBe(calls)
    expect(screen.getByLabelText('Card').getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'midnight' } })
    expect(onChange.mock.lastCall![0].id).toBe('midnight')
  })

  it('warns about low contrast', () => {
    render(<ThemeEditor value={{ ...structuredClone(presetTheme('classic')!), colors: { ...presetTheme('classic')!.colors, label: '#eeeeee' } }} view="pedigree" onChange={() => {}} />)
    expect(screen.getAllByText('Low contrast with the card color').length).toBeGreaterThan(0)
  })

  it('is available from the explorer toolbar and recolors the view', () => {
    const onThemeChange = vi.fn()
    render(<PedigreeExplorer projection={projection} layout={layout} theme="classic" themeEditor onThemeChange={onThemeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Colors' }))
    fireEvent.change(screen.getByLabelText('Card'), { target: { value: '#fff8e7' } })
    expect(onThemeChange.mock.lastCall![0].colors.nodeBackground).toBe('#fff8e7')
    expect(document.querySelector('svg.op-root')!.getAttribute('style')).toContain('--op-node-background: #fff8e7')
  })
})
