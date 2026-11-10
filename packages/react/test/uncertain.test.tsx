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
