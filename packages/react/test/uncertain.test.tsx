// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutSync, normalizePedigree, projectPedigree } from '@captiveorigins/onepedigree-core'
import { PedigreeExplorer, PedigreeView } from '../src'

afterEach(cleanup)

const doc = normalizePedigree({
  schemaVersion: 1,
  individuals: [
    { id: 'd1', label: 'Ruby' },
    { id: 'k', label: 'Kit', parentage: { parents: [], uncertainParents: [
      { role: 'father', candidates: [], kind: 'wild', shared: 'WILD1' },
      { role: 'mother', candidates: [{ individual: 'd1', probability: 0.6 }] },
    ] } },
  ],
})
const projection = projectPedigree(doc, { view: 'pedigree', focalId: 'k' })
const layout = layoutSync(projection)

describe('uncertain parents in React views', () => {
  it('draws them dashed, by kind, with the candidates on the node and in the spoken name', () => {
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} />)
    expect(html).toContain('data-uncertain="wild"')
    expect(html).toContain('data-uncertain="multiple"')
    expect(html.match(/class="op-connector[^"]*"[^>]*data-uncertain="true"/g)).toHaveLength(2)
    expect(html).toContain('Possible mothers, Ruby 60% · unknown 40%')
    expect(html).toContain('Wild father, shared by clutchmates')
    expect(html).not.toContain('parentage not recorded, Possible')
  })

  it('never links a placeholder, even when the host links every individual', () => {
    const getIndividualHref = vi.fn((i: { id: string }) => `/animals/${i.id}`)
    const html = renderToStaticMarkup(<PedigreeView projection={projection} layout={layout} getIndividualHref={getIndividualHref} />)
    expect(html).toContain('href="/animals/k"')
    expect(html).not.toMatch(/href="\/animals\/~/)
    expect(getIndividualHref.mock.calls.every(([i]) => !i.id.startsWith('~'))).toBe(true)
  })

  it('in the explorer, selecting a placeholder offers no link to open it', () => {
    render(<PedigreeExplorer projection={projection} layout={layout} getIndividualHref={(i) => `/animals/${i.id}`} />)
    fireEvent.click(screen.getByRole('button', { name: /^Kit/ }))
    expect(document.querySelector('a[href="/animals/k"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Possible mothers/ }))
    expect(document.querySelector('a[href^="/animals/~"]')).toBeNull()
  })
})

describe("uncertain parents as alternative branches (uncertainParents: 'branches')", () => {
  // Made-up: two visible possible sires, one private, 5% unrecorded; and a pup whose dam is only private candidates.
  const litter = normalizePedigree({
    schemaVersion: 1,
    individuals: [
      { id: 's1', label: 'Sire one', sex: 'male' },
      { id: 's2', label: 'Sire two' },
      { id: 'h', label: 'Hidden male', data: { private: true } },
      { id: 'pup', label: 'Pup', parentage: { parents: [], uncertainParents: [{
        role: 'father', basis: 'multi-sire mating',
        candidates: [{ individual: 's1', probability: 0.7 }, { individual: 's2', probability: 0.05 }, { individual: 'h', probability: 0.2 }],
      }] } },
      { id: 'lone', label: 'Lone', parentage: { parents: [], uncertainParents: [{ role: 'mother', candidates: [{ individual: 'h', probability: 1 }] }] } },
    ],
  })
  const project = (focalId: string, uncertainParents?: 'placeholder' | 'branches') => projectPedigree(litter, { view: 'pedigree', focalId, ...(uncertainParents ? { uncertainParents } : {}) })
  const draw = (p: ReturnType<typeof project>, extra: Partial<Parameters<typeof PedigreeView>[0]> = {}) => renderToStaticMarkup(<PedigreeView projection={p} layout={layoutSync(p)} {...extra} />)
  const href = (i: { id: string }) => `/animals/${i.id}`

  it('draws exactly as before unless asked', () => {
    expect(draw(project('pup', 'placeholder'))).toBe(draw(project('pup')))
    const html = draw(project('pup'))
    expect(html).not.toContain('data-branch')
    expect(html).not.toContain('op-connector-label')
    expect(html).toContain('Possible fathers, Sire one 70% · Sire two 5% · 1 private · unknown 5% · multi-sire mating')
  })

  it('draws each branch on a dashed connector marked uncertain, labelled with its chance', () => {
    const html = draw(project('pup', 'branches'))
    expect(html.match(/<path class="op-connector"[^>]*data-uncertain="true" data-branch="true"/g)).toHaveLength(4)
    const labels = [...html.matchAll(/<text class="op-connector-label"[^>]*aria-hidden="true">([^<]*)<\/text>/g)].map((m) => m[1])
    expect(labels).toEqual(['70%', '5%', '20%', '5%'])
    // The private candidates and the remainder are placeholders, dashed like any.
    expect(html.match(/data-uncertain="multiple"/g)).toHaveLength(2)
    expect(html).toContain('data-candidate="true"')
  })

  it('links real candidate occurrences when the host links individuals, never the placeholders', () => {
    const getIndividualHref = vi.fn(href)
    const html = draw(project('pup', 'branches'), { getIndividualHref })
    expect(html).toContain('href="/animals/s1"')
    expect(html).toContain('href="/animals/s2"')
    expect(html).not.toMatch(/href="\/animals\/(~|h")/)
    expect(getIndividualHref.mock.calls.map(([i]) => i.id).sort()).toEqual(['pup', 's1', 's2'])
  })

  it('speaks each candidate with its role, chance and basis, and each placeholder with its share', () => {
    const html = draw(project('pup', 'branches'), { getIndividualHref: href })
    expect(html).toContain('aria-label="Sire one, possible father, 70%, multi-sire mating, ')
    expect(html).toContain('aria-label="Sire two, possible father, 5%, multi-sire mating')
    expect(html).toContain('<title>Possible father, 1 private, 20% · multi-sire mating</title>')
    expect(html).toContain('<title>Possible father, other, 5% · multi-sire mating</title>')
    expect(html).not.toContain('Hidden male')
  })

  it('a slot with only private candidates is drawn as by default', () => {
    expect(draw(project('lone', 'branches'))).toBe(draw(project('lone')))
    expect(draw(project('lone', 'branches'))).toContain('Possible mothers, 1 private')
  })

  it('in the explorer, a candidate can be opened and says what it is; a placeholder offers nothing to open', () => {
    const p = project('pup', 'branches')
    render(<PedigreeExplorer projection={p} layout={layoutSync(p)} getIndividualHref={href} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sire one, possible father, 70%/ }))
    expect(document.querySelector('a[href="/animals/s1"]')).not.toBeNull()
    expect(screen.getByRole('dialog').textContent).toContain('Possible father, 70%, multi-sire mating')
    fireEvent.click(screen.getByRole('button', { name: /^Possible father, 1 private/ }))
    expect(document.querySelector('a[href^="/animals/~"]')).toBeNull()
  })
})

describe('a recorded parent who is also a candidate', () => {
  // OneLineage's misattribution case: the recorded man is the legal father and also one of the DNA candidates.
  const misattributed = normalizePedigree({
    schemaVersion: 1,
    individuals: [
      { id: 'rec', label: 'Recorded man' },
      { id: 'other', label: 'Other man' },
      { id: 'child', label: 'Child', parentage: { parents: [{ individual: 'rec', role: 'father', kind: 'legal' }], uncertainParents: [{ role: 'father', basis: 'DNA hypothesis', candidates: [{ individual: 'rec', probability: 0.3 }, { individual: 'other', probability: 0.6 }] }] } },
    ],
  })
  const p = projectPedigree(misattributed, { view: 'pedigree', focalId: 'child', uncertainParents: 'branches', parentLinks: 'both' })

  it('marks both occurrences as the same, repeated individual, in the drawing and the spoken name', () => {
    const recs = p.occurrences.filter((o) => o.individualId === 'rec')
    expect(recs).toHaveLength(2)
    expect(recs.every((o) => o.repeated)).toBe(true)
    const html = renderToStaticMarkup(<PedigreeView projection={p} layout={layoutSync(p)} />)
    expect(html.match(/data-individual="rec"[^>]*data-repeated="true"/g)).toHaveLength(2)
  })

  it('selecting the person selects both of its occurrences', () => {
    const html = renderToStaticMarkup(<PedigreeView projection={p} layout={layoutSync(p)} interactive selectedIndividualId="rec" />)
    expect(html.match(/data-individual="rec"[^>]*data-selected="true"/g)).toHaveLength(2)
  })
})
