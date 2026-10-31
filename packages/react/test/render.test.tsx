import { layoutSync, PEDIGREE_VIEWS, projectPedigree } from '@captiveorigins/onepedigree-core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { humanFamily, multiplePaternityClutch, parthenogenesis, reptileBreeding, sharedAncestors } from '../../../fixtures'
import { describeProjection, PedigreeView } from '../src'

const render = (doc: Parameters<typeof projectPedigree>[0], options: Parameters<typeof projectPedigree>[1], extra: Partial<Parameters<typeof PedigreeView>[0]> = {}) => {
  const projection = projectPedigree(doc, options)
  return renderToStaticMarkup(<PedigreeView projection={projection} layout={layoutSync(projection)} {...extra} />)
}

describe('server rendering', () => {
  it('renders every view as accessible SVG without client JavaScript', () => {
    for (const view of PEDIGREE_VIEWS) {
      const html = render(reptileBreeding, { focalId: 'ember', view, relatedId: 'luna' })
      expect(html, view).toMatch(/^<svg[^>]+role="group"/)
      expect(html).toContain(`data-view="${view}"`)
      expect(html).toMatch(/<title id="[^"]+-title">/)
      expect(html).toMatch(/<desc id="[^"]+-desc">[^<]+<\/desc>/)
      expect(html).toContain('data-individual="ember"')
      expect(html).not.toContain('onClick')
    }
  })

  it('marks occurrences, repeats, modes and the focal individual with stable classes and data attributes', () => {
    const html = render(sharedAncestors, { focalId: 'focal', view: 'pedigree', ancestorDepth: 2 })
    expect(html.match(/data-individual="founder"/g)).toHaveLength(2)
    expect(html).toMatch(/class="op-node op-individual" data-individual="founder" data-occurrence="founder#0" data-generation="2" data-repeated="true"/)
    expect(html).toMatch(/data-individual="focal"[^>]*data-focal="true"/)
    expect(html).toContain('class="op-connector"')
    expect(html).toContain('data-reproductive-mode="sexual"')
    // Non-color cues: repeat glyph and junction shape with a text description.
    expect(html).toContain('op-repeat-marker')
    expect(html).toMatch(/class="op-junction" data-structure="pair" data-completeness="complete"/)
  })

  it('distinguishes reproductive modes by shape and line pattern data', () => {
    const html = render(parthenogenesis, { focalId: 'p2', view: 'pedigree' })
    expect(html).toMatch(/data-structure="single"/)
    expect(html).toContain('data-reproductive-mode="parthenogenesis"')
    expect(html).toContain('parthenogenesis, 1 recorded parent')
  })

  it('keeps ordinary profile links and accessible names', () => {
    const html = render(humanFamily, { focalId: 'gwen', view: 'pedigree', ancestorDepth: 1 }, { getIndividualHref: (i) => `/animals/${i.id}` })
    expect(html).toContain('<a href="/animals/ellen" aria-label="Ellen, female, sexual reproduction')
  })

  it('draws fan segments and cohort markers, and numbers Ahnentafel entries', () => {
    expect(render(humanFamily, { focalId: 'gwen', view: 'fan', ancestorDepth: 2 }).match(/class="op-fan-segment"/g)).toHaveLength(7)
    const cohort = render(multiplePaternityClutch, { focalId: 'egg-1', view: 'cohort' })
    expect(cohort).toContain('<text class="op-cohort-label"')
    expect(cohort).toContain('Clutch 2026-001')
    expect(render(humanFamily, { focalId: 'gwen', view: 'ahnentafel', ancestorDepth: 1 })).toContain('#3')
  })

  it('uses the render slots and terminology', () => {
    const html = render(
      reptileBreeding,
      { focalId: 'tinta', view: 'cohort' },
      {
        renderIndividual: ({ individual }) => <text className="custom">{individual?.label}!</text>,
        renderCohortMarker: ({ group }) => <text className="custom-cohort">{group.label}</text>,
        terminology: { individuals: 'animals' },
      },
    )
    expect(html).toContain('<text class="custom">Tinta!</text>')
    expect(html).toContain('<text class="custom-cohort">2022 clutch</text>')
    expect(html).toContain('4 animals')
  })

  it('names anonymous placeholders "Private record", never by their ID', () => {
    const doc = {
      schemaVersion: 1 as const,
      individuals: [
        { id: 'private-1', data: { private: true } },
        { id: 'kid', label: 'Kid', parentage: { parents: [{ individual: 'private-1', role: 'father' }] } },
      ],
    }
    const html = render(doc, { focalId: 'kid', view: 'pedigree' })
    expect(html).toContain('Private record')
    expect(html).not.toContain('>private-1<')
  })

  it('summarizes the projection in words', () => {
    const p = projectPedigree(reptileBreeding, { focalId: 'ember', view: 'inbreeding' })
    expect(describeProjection(p)).toBe('Inbreeding of Ember: 4 individuals across 3 generations. 1 individual appears more than once.')
  })
})
