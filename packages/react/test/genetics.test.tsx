// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { layoutSync, projectPedigree, type PedigreeDocument } from '@extantape/onepedigree-core'
import { GenotypeDots, PedigreeExplorer, PedigreeView, GeneLegend, type GenotypeMark } from '../src'

afterEach(cleanup)

const doc: PedigreeDocument = {
  schemaVersion: 1,
  individuals: [
    { id: 'm', label: 'Mother', sex: 'female' },
    { id: 'f', label: 'Father', sex: 'male' },
    { id: 'c', label: 'Child', parentage: { parents: [{ individual: 'm', role: 'mother' }, { individual: 'f', role: 'father' }] } },
  ],
}

describe('gene overlay', () => {
  const projection = projectPedigree(doc, { view: 'pedigree', focalId: 'c' })
  const layout = layoutSync(projection)
  const marks = new Map<string, GenotypeMark>([
    ['c', { state: 'visual' }],
    ['m', { state: 'het', basis: 'inferred' }],
  ])

  it('draws a symbol on every node, unknown where nothing is recorded, and says it in the label', () => {
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} interactive geneOverlay={{ label: 'Rec', marks }} />)
    expect(html.match(/class="op-gene"/g)).toHaveLength(3)
    expect(html).toContain('data-state="visual"')
    expect(html).toContain('data-state="unknown"')
    expect(html).toMatch(/Rec: Het: carries one copy, not proven \(suggested from relatives\)/)
  })

  it('shows a legend with every symbol', () => {
    render(<PedigreeExplorer projection={projection} layout={layout} geneOverlay={{ label: 'Rec', marks, mode: 'recessive' }} />)
    const legend = screen.getByRole('group', { name: 'Rec' })
    expect(legend.querySelectorAll('li')).toHaveLength(6)
    expect(legend.textContent).toContain('Possible het (chance shown): 66%')
    render(<GeneLegend overlay={{ label: 'Inc', marks, mode: 'incomplete-dominant' }} />)
    expect(screen.getByRole('group', { name: 'Inc' }).textContent).toContain('Two copies ("super")')
  })
})

describe('allele dots', () => {
  it('draws two dots per gene (one for a hemizygous sex-linked gene), filled by copies, and says it in words', () => {
    const projection = projectPedigree(doc, { view: 'pedigree', focalId: 'c' })
    const display = {
      genes: [
        { id: 'r', label: 'Rec', color: '#cf8137', mode: 'recessive' as const },
        { id: 'z', label: 'Zed', color: '#2f7d5c', mode: 'recessive' as const, linkage: 'Z' as const },
      ],
      records: new Map([
        ['c', [{ gene: 'r', state: 'visual' as const }, { gene: 'z', state: 'visual' as const }]],
        ['m', [{ gene: 'r', state: 'possible-het' as const, probability: 0.66 }]],
      ]),
      sexOf: (id: string) => (id === 'c' ? ('heterogametic' as const) : ('unknown' as const)),
    }
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layoutSync(projection)} interactive genotypes={display} />)
    const { container } = render(<PedigreeView projection={projection} layout={layoutSync(projection)} interactive genotypes={display} />)
    const child = container.querySelector('[data-individual="c"]')!
    expect(child.querySelectorAll('.op-dots[data-gene="r"] [data-dot="filled"]')).toHaveLength(2)
    expect(child.querySelectorAll('.op-dots[data-gene="z"] .op-dot')).toHaveLength(1) // hemizygous: one copy
    const mother = container.querySelector('[data-individual="m"]')!
    expect([...mother.querySelectorAll('.op-dots[data-gene="r"] .op-dot')].map((d) => d.getAttribute('data-dot'))).toEqual(['possible', 'empty'])
    expect(html).toMatch(/Rec: Possible het \(chance shown\): 66%/)
    expect(html).toMatch(/Zed: Unknown/)
  })
})

describe('honest copies', () => {
  it('draws a visual non-recessive gene as one known copy and one unknown', () => {
    const { container } = render(
      <svg>
        <GenotypeDots gene={{ id: 'd', label: 'Dom', color: '#000', mode: 'dominant' }} record={{ gene: 'd', state: 'visual' }} />
      </svg>,
    )
    expect([...container.querySelectorAll('.op-dot')].map((d) => d.getAttribute('data-dot'))).toEqual(['filled', 'unknown'])
  })
})
