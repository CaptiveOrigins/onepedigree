// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { layoutSync, projectPedigree, type PedigreeDocument } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, PedigreeView, TraitLegend, type TraitMark } from '../src'

afterEach(cleanup)

const doc: PedigreeDocument = {
  schemaVersion: 1,
  individuals: [
    { id: 'm', label: 'Mother', sex: 'female' },
    { id: 'f', label: 'Father', sex: 'male' },
    { id: 'c', label: 'Child', parentage: { parents: [{ individual: 'm', role: 'mother' }, { individual: 'f', role: 'father' }] } },
  ],
}

describe('trait overlay', () => {
  const projection = projectPedigree(doc, { view: 'pedigree', focalId: 'c' })
  const layout = layoutSync(projection)
  const marks = new Map<string, TraitMark>([
    ['c', { state: 'visual' }],
    ['m', { state: 'het', basis: 'inferred' }],
  ])

  it('draws a symbol on every node, unknown where nothing is recorded, and says it in the label', () => {
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} interactive traitOverlay={{ label: 'Rec', marks }} />)
    expect(html.match(/class="op-trait"/g)).toHaveLength(3)
    expect(html).toContain('data-state="visual"')
    expect(html).toContain('data-state="unknown"')
    expect(html).toMatch(/Rec: Het: carries one copy, not proven \(suggested from relatives\)/)
  })

  it('shows a legend with every symbol', () => {
    render(<PedigreeExplorer projection={projection} layout={layout} traitOverlay={{ label: 'Rec', marks, mode: 'recessive' }} />)
    const legend = screen.getByRole('group', { name: 'Rec' })
    expect(legend.querySelectorAll('li')).toHaveLength(6)
    expect(legend.textContent).toContain('Possible het (chance shown): 66%')
    render(<TraitLegend overlay={{ label: 'Inc', marks, mode: 'incomplete-dominant' }} />)
    expect(screen.getByRole('group', { name: 'Inc' }).textContent).toContain('Two copies ("super")')
  })
})
