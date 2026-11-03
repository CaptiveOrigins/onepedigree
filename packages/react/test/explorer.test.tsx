// @vitest-environment jsdom
import { layoutSync, projectPedigree } from '@captiveorigins/onepedigree-core'
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
