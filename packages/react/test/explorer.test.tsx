// @vitest-environment jsdom
import { layoutSync, projectPedigree } from '@extantape/onepedigree-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sharedAncestors } from '../../../fixtures'
import { nearestNode, PedigreeExplorer } from '../src'

const projection = projectPedigree(sharedAncestors, { focalId: 'focal', view: 'pedigree', ancestorDepth: 2 })
const layout = layoutSync(projection)
const ui = <PedigreeExplorer projection={projection} layout={layout} getIndividualHref={(i) => `/animals/${i.id}`} />
const node = (occurrence: string) => document.querySelector<SVGGElement>(`[data-occurrence="${occurrence}"]`)!

afterEach(cleanup)

describe('explorer', () => {
  it('selects an individual and highlights every occurrence of it', () => {
    render(ui)
    fireEvent.click(node('founder#0'))
    expect(node('founder#0').getAttribute('aria-pressed')).toBe('true')
    expect(node('founder#1').getAttribute('data-highlighted')).toBe('true')
    expect(screen.getByRole('dialog').textContent).toContain('Founder')
    expect(screen.getByRole('link', { name: 'Open profile' }).getAttribute('href')).toBe('/animals/founder')
    fireEvent.keyDown(node('founder#0'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves focus between nodes with the arrow keys and selects with Enter', () => {
    render(ui)
    node('focal#0').focus()
    fireEvent.keyDown(node('focal#0'), { key: 'ArrowUp' })
    const up = nearestNode(layout, 'focal#0', 'up')!
    expect(document.activeElement).toBe(node(up))
    fireEvent.keyDown(node(up), { key: 'Enter' })
    expect(node(up).getAttribute('aria-pressed')).toBe('true')
  })

  it('zooms with the controls and fits back', () => {
    render(ui)
    const svg = document.querySelector('svg.op-root')!
    const before = svg.getAttribute('viewBox')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(svg.getAttribute('viewBox')).not.toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Fit to view' }))
    expect(svg.getAttribute('viewBox')).toBe(before)
  })

  it('hydrates server markup without mismatches', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(ui)
    document.body.appendChild(container)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      hydrateRoot(container, ui)
    })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('click-and-drag rearranging', () => {
  it('computes the new row order from where a node is dropped', async () => {
    const { dropNodeOrder } = await import('../src')
    const { layoutSync, projectPedigree } = await import('@extantape/onepedigree-core')
    const { reptileBreeding } = await import('../../../fixtures')
    const p = projectPedigree(reptileBreeding, { focalId: 'rf-dam', view: 'descendants', descendantDepth: 1 })
    const l = layoutSync(p)
    const kids = l.nodes.filter((n) => p.occurrences.find((o) => o.occurrenceId === n.occurrenceId)!.generation === -1).sort((a, b) => a.x - b.x)
    const last = kids.at(-1)!
    const order = dropNodeOrder(l, last.occurrenceId, { dx: kids[0]!.x - last.x - 10, dy: 0 })!
    expect(order[0]).toBe(last.occurrenceId)
    expect(dropNodeOrder(l, last.occurrenceId, { dx: 2, dy: 0 })).toBeNull()
    // Applying it moves the node to the front of its siblings.
    const after = layoutSync(p, { nodeOrder: order })
    const xs = after.nodes.filter((n) => kids.some((k) => k.occurrenceId === n.occurrenceId)).sort((a, b) => a.x - b.x)
    expect(xs[0]!.occurrenceId).toBe(last.occurrenceId)
  })
})

describe('rearranging keeps groups truthful', () => {
  it('does not move a node out of its clutch frame', async () => {
    const { dropNodeOrder } = await import('../src')
    const { layoutSync, projectPedigree } = await import('@extantape/onepedigree-core')
    const { reptileBreeding } = await import('../../../fixtures')
    const p = projectPedigree(reptileBreeding, { focalId: 'rf-dam', view: 'descendants', descendantDepth: 1 })
    const l = layoutSync(p)
    const groupOf = (id: string) => (p.groups ?? []).filter((g) => g.occurrenceIds.includes(id)).map((g) => g.id).join('|')
    const kids = l.nodes.filter((n) => p.occurrences.find((o) => o.occurrenceId === n.occurrenceId)!.generation === -1).sort((a, b) => a.x - b.x)
    const last = kids.at(-1)!
    // The last child is alone in its clutch: dragging it to the front changes nothing.
    const alone = kids.filter((k) => groupOf(k.occurrenceId) === groupOf(last.occurrenceId)).length === 1
    if (alone) expect(dropNodeOrder(l, last.occurrenceId, { dx: kids[0]!.x - last.x - 10, dy: 0 }, [], groupOf)).toBeNull()
    expect(alone).toBe(true)
  })
})
