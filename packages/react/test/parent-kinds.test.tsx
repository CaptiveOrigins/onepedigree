// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutSync, normalizePedigree, projectPedigree, type ParentLinksMode } from '@extantape/onepedigree-core'

import { fosterDam, fosterDamBiological, humanFamily } from '../../../fixtures'
import { PedigreeExplorer, PedigreeView } from '../src'

afterEach(cleanup)

// Parent kinds (agreed with OneLineage, 2026-11-10). Pip's foster dam Saffron is a `social` link.
const draw = (parentLinks?: ParentLinksMode, d = fosterDam, focalId = 'pip') => {
  const projection = projectPedigree(d, { view: 'pedigree', focalId, ancestorDepth: 1, ...(parentLinks ? { parentLinks } : {}) })
  return { projection, layout: layoutSync(projection) }
}
const html = (parentLinks?: ParentLinksMode) => renderToStaticMarkup(<PedigreeView {...draw(parentLinks)} />)

describe('parent kinds in React views', () => {
  it('without kinds, every mode renders byte for byte as the default', () => {
    const base = renderToStaticMarkup(<PedigreeView {...draw(undefined, humanFamily, 'iris')} />)
    expect(base).not.toMatch(/data-kind|data-non-biological|op-parent-link/)
    for (const mode of ['both', 'biological', 'recorded'] as const) expect(renderToStaticMarkup(<PedigreeView {...draw(mode, humanFamily, 'iris')} />)).toBe(base)
  })

  it('draws a non-biological link as a dotted connector with its kind on the line', () => {
    const h = html()
    const links = h.match(/<path class="op-connector"[^>]*>/g)!
    expect(links.filter((l) => l.includes('data-non-biological="true"'))).toHaveLength(1)
    expect(links.find((l) => l.includes('data-non-biological'))).toContain('data-kind="social"')
    expect(h).toMatch(/<g class="op-parent-link" data-kind="social">.*<text class="op-connector-label"[^>]*aria-hidden="true">social<\/text><\/g>/)
    // The pattern is its own: large round dots, unlike any reproductive mode or the uncertain long dash.
    const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
    const rule = css.match(/\.op-connector\[data-non-biological\] \{([^}]*)\}/)![1]!
    expect(rule).toContain('stroke-dasharray: 0 6')
    expect(rule).toContain('stroke-linecap: round')
    for (const other of css.matchAll(/\.op-connector\[data-(?:reproductive-mode|branch)[^{]*\{([^}]*)\}/g)) expect(other[1]).not.toContain('stroke-dasharray: 0 6')
  })

  it('says the kind in the connector and the parent node spoken text', () => {
    const h = html()
    expect(h).toContain('<title>Saffron, social mother of Pip</title>')
    expect(h).toMatch(/<title>Saffron, social mother of Pip, female/)
    // Biological links keep their old, unlabelled markup.
    expect(h.match(/<path[^>]*><title>/g)).toHaveLength(1)
  })

  it("'biological' hides the foster link, 'recorded' shows it in place of the biological dam, 'both' shows all", () => {
    const names = (h: string) => [...h.matchAll(/data-individual="([^"]+)"/g)].map((m) => m[1]).sort()
    expect(names(html())).toEqual(['maya', 'pip', 'rio', 'saffron'])
    expect(names(html('both'))).toEqual(['maya', 'pip', 'rio', 'saffron'])
    expect(names(html('biological'))).toEqual(['maya', 'pip', 'rio'])
    expect(html('biological')).toBe(renderToStaticMarkup(<PedigreeView {...draw(undefined, fosterDamBiological)} />))
    expect(names(html('recorded'))).toEqual(['pip', 'rio', 'saffron'])
    expect(html('recorded')).toContain('data-non-biological="true"')
  })

  it('the explorer keeps keyboard access, names the kind in the quick view and offers the three modes', () => {
    const onParentLinksChange = vi.fn()
    render(<PedigreeExplorer {...draw()} parentLinks="both" onParentLinksChange={onParentLinksChange} />)
    const saffron = document.querySelector<SVGGElement>('[data-occurrence="saffron#0"]')!
    expect(saffron.getAttribute('tabindex')).toBe('0')
    expect(saffron.getAttribute('aria-label')).toMatch(/^Saffron, social mother of Pip/)
    fireEvent.keyDown(saffron, { key: 'Enter' })
    expect(screen.getByRole('dialog').textContent).toContain('Social mother of Pip')
    const chooser = screen.getByRole('combobox', { name: 'Parent links' }) as HTMLSelectElement
    expect([...chooser.options].map((o) => [o.value, o.textContent])).toEqual([
      ['both', 'All links'],
      ['biological', 'Biological only'],
      ['recorded', 'Parents of record'],
    ])
    fireEvent.change(chooser, { target: { value: 'biological' } })
    expect(onParentLinksChange).toHaveBeenCalledWith('biological')
  })

  it('shows no chooser unless the host asks for one', () => {
    render(<PedigreeExplorer {...draw()} />)
    expect(screen.queryByRole('combobox', { name: 'Parent links' })).toBeNull()
  })
})

// Keep the normalizer in the loop: a kind survives normalizing and reaches the view.
it('a normalized document keeps the kind for the view', () => {
  const h = renderToStaticMarkup(<PedigreeView {...draw(undefined, normalizePedigree(fosterDam))} />)
  expect(h).toContain('data-kind="social"')
})
