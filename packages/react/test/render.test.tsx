import { layoutSync, PEDIGREE_VIEWS, projectPedigree } from '@captiveorigins/onepedigree-core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { humanFamily, multiplePaternityClutch, parthenogenesis, privateAncestor, reptileBreeding, sharedAncestors } from '../../../fixtures'
import { ahnentafelRelation, AhnentafelList, describeProjection, PedigreeView } from '../src'

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

  it('marks a private placeholder, names it "Private record" and never shows its ID', () => {
    const projection = projectPedigree(privateAncestor, { focalId: 'pebble', view: 'pedigree' })
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layoutSync(projection)} />)
    const node = html.match(/<g[^>]*data-individual="private-1"[^>]*>[\s\S]*?<\/g>/)![0]
    expect(node).toContain('data-private="true"')
    expect(node).toContain('Private record')
    expect(html.match(/data-private/g)).toHaveLength(1)
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

  it('says the sex in words in the spoken name, and keeps the visible symbol', () => {
    const doc = {
      schemaVersion: 1 as const,
      individuals: [
        { id: 'dam', label: 'Dam', sex: 'F' },
        { id: 'sire', label: 'Sire', sex: 'm' },
        { id: 'kit', label: 'Kit', parentage: { parents: [{ individual: 'dam', role: 'mother' }, { individual: 'sire', role: 'father' }] } },
        { id: 'odd', label: 'Odd', sex: 'intersex', parentage: { parents: [{ individual: 'dam', role: 'mother' }] } },
      ],
    }
    const name = (html: string, id: string) => html.match(new RegExp(`data-individual="${id}"[^>]*>(?:<a[^>]*aria-label="([^"]+)"|<title>([^<]+)</title>)`))?.slice(1).find(Boolean)
    for (const extra of [{}, { getIndividualHref: (i: { id: string }) => `/animals/${i.id}` }]) {
      const html = render(doc, { focalId: 'kit', view: 'pedigree' }, extra)
      expect(name(html, 'dam')).toMatch(/^Dam, female, /)
      expect(name(html, 'sire')).toMatch(/^Sire, male, /)
      expect(name(html, 'kit')).toMatch(/^Kit, sex unknown, /)
      expect(html).toContain('>♀</text>')
      expect(html).toContain('>♂</text>')
    }
    expect(name(render(doc, { focalId: 'odd', view: 'pedigree' }), 'odd')).toMatch(/^Odd, intersex, /)
    const es = render(doc, { focalId: 'kit', view: 'pedigree' }, { terminology: { female: 'hembra', male: 'macho', sexUnknown: 'sexo desconocido' } })
    expect(name(es, 'dam')).toMatch(/^Dam, hembra, /)
    expect(name(es, 'kit')).toMatch(/^Kit, sexo desconocido, /)
    const button = renderToStaticMarkup(<PedigreeView projection={projectPedigree(doc, { focalId: 'kit', view: 'pedigree' })} layout={layoutSync(projectPedigree(doc, { focalId: 'kit', view: 'pedigree' }))} interactive />)
    expect(button).toMatch(/role="button" tabindex="0" aria-label="Sire, male, /)
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

describe('labels, fan text, timeline and Ahnentafel (2026-11-01 feedback)', () => {
  const family = {
    schemaVersion: 1 as const,
    individuals: [
      { id: 'gran', label: 'Grandmother Anneliese Wilhelmina Bergström-Johansson', sex: 'female', data: { born: '1921', died: '1999-05-02' } },
      { id: 'grandpa', label: 'Grandpa', sex: 'male', data: { born: 1919 } },
      { id: 'mom', label: 'Mom', sex: 'female', data: { born: 1950, living: true }, parentage: { parents: [{ individual: 'gran', role: 'mother' }, { individual: 'grandpa', role: 'father' }] } },
      { id: 'me', label: 'Me', parentage: { parents: [{ individual: 'mom', role: 'mother' }] } },
    ],
  }

  it('sizes nodes to their names and shows sex and life years', () => {
    const projection = projectPedigree(family, { focalId: 'me', view: 'pedigree' })
    const layout = layoutSync(projection)
    const gran = layout.nodes.find((n) => n.occurrenceId.startsWith('gran'))!
    const me = layout.nodes.find((n) => n.occurrenceId.startsWith('me'))!
    expect(gran.width).toBeGreaterThan(me.width)
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} />)
    expect(html).toContain('Grandmother Anneliese Wilhelmina Bergström-Johansson</text>')
    expect(html).toContain('♀ 1921 – 1999')
    expect(html).toContain('♂ 1919 – unknown')
    expect(html).toContain('♀ 1950 – present')
    // No overlaps within a row.
    const rows = new Map<number, typeof layout.nodes>()
    for (const n of layout.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n])
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.width)
    }
  })

  it('writes fan labels along the arc', () => {
    const html = render(family, { focalId: 'me', view: 'fan' })
    expect(html).toContain('<textPath')
  })

  it('draws a timeline of lifespans on a year axis', () => {
    const projection = projectPedigree(family, { focalId: 'me', view: 'timeline' })
    const layout = layoutSync(projection)
    expect(layout.kind).toBe('timeline')
    const x = (id: string) => layout.nodes.find((n) => n.occurrenceId.startsWith(id))!
    expect(x('grandpa').x).toBeLessThan(x('mom').x)
    expect(x('me').life).toEqual({ open: false, undated: true })
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} />)
    expect(html).toContain('op-timeline-axis')
  })

  it('lists the Ahnentafel by generation with relationships', () => {
    expect([ahnentafelRelation(2), ahnentafelRelation(3), ahnentafelRelation(6)]).toEqual(['Father', 'Mother', 'Mother’s father'])
    const html = renderToStaticMarkup(<AhnentafelList projection={projectPedigree(family, { focalId: 'me', view: 'ahnentafel' })} />)
    expect(html).toContain('Generation 3')
    expect(html).toMatch(/6\.<\/span> <span>Grandpa<\/span>/)
  })
})

