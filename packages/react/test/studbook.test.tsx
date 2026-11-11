// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudbookTable, type StudbookRow } from '../src'

afterEach(cleanup)

const row = (over: Partial<StudbookRow> & Pick<StudbookRow, 'id' | 'studbookNumber' | 'coId'>): StudbookRow => ({ sex: 'female', birthType: 'captive', status: 'alive', ...over })
const rows: StudbookRow[] = [
  row({ id: 'a', studbookNumber: '10', coId: 'CO-A-0010', animalId: 'Shelly', birthSort: '2015', birthDate: '2015 (year only)', genetics: { meanKinship: 0.125, inbreeding: 0 }, holder: 'Holder 3' }),
  row({ id: 'b', studbookNumber: '2', oldNumbers: ['T1'], coId: 'CO-A-0002', animalId: 'Tank', sex: 'male', birthType: 'wild', birthSort: '2001-04-02', birthDate: '2 Apr 2001', sire: 'WILD', dam: 'WILD', genetics: { meanKinship: 0.05, inbreeding: 0.0625 } }),
  row({ id: 'c', studbookNumber: 'T3', coId: 'CO-A-0031', status: 'dead', sire: '2', dam: '10' }),
  row({ id: 'secret', studbookNumber: '7', coId: 'CO-A-SECRET', animalId: 'Hidden', private: true, status: 'dead' }),
]
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')
const firstCells = () => bodyRows().map((r) => r.querySelector('th, td')!.textContent!.replace(/ \(was .*\)$/, ''))

describe('studbook table', () => {
  it('shows both IDs on every animal and keeps private animals as placeholders that reveal nothing', () => {
    const html = renderToStaticMarkup(<StudbookTable rows={rows} caption="Redfoot assurance" showAll />)
    for (const s of ['CO-A-0010', 'Shelly', 'CO-A-0002', 'Tank', 'CO-A-0031', 'was T1']) expect(html).toContain(s)
    expect(html).toContain('Private animal')
    for (const s of ['CO-A-SECRET', 'Hidden', '>7<']) expect(html).not.toContain(s)
    expect(html).toContain('Showing 4 of 4 animals')
  })

  it('finds an animal by studbook number, old number, CO ID or Animal ID, and never matches a private one', () => {
    render(<StudbookTable rows={rows} caption="Book" showAll />)
    const search = screen.getByRole('searchbox', { name: 'Find an animal' })
    for (const [q, first] of [['t1', '2'], ['tank', '2'], ['co-a-0010', '10'], ['T3', 'T3']] as const) {
      fireEvent.change(search, { target: { value: q } })
      expect(firstCells()).toEqual([first])
    }
    for (const q of ['secret', 'Hidden', '7']) {
      fireEvent.change(search, { target: { value: q } })
      expect(firstCells()).toEqual(['No animals match.'])
    }
    expect(screen.getByRole('status').textContent).toBe('Showing 0 of 4 animals')
  })

  it('shows living animals by default, without dropping private ones, so the filter reveals nothing about them', () => {
    render(<StudbookTable rows={rows} caption="Book" />)
    expect(firstCells()).toEqual(['2', '10', expect.stringContaining('Private animal')])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Living animals only' }))
    expect(firstCells()).toEqual(['2', '10', 'T3', expect.stringContaining('Private animal')])
  })

  it('sorts permanent numbers numerically, then temporary ones, and by mean kinship, unknowns last, with aria-sort', () => {
    render(<StudbookTable rows={rows} caption="Book" showAll />)
    expect(firstCells().slice(0, 3)).toEqual(['2', '10', 'T3'])
    const mk = screen.getByRole('button', { name: 'Sort by MK (Mean kinship)' })
    fireEvent.click(mk)
    expect(firstCells().slice(0, 3)).toEqual(['2', '10', 'T3'])
    expect(mk.closest('th')!.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(mk)
    expect(firstCells().slice(0, 3)).toEqual(['10', '2', 'T3'])
    expect(mk.closest('th')!.getAttribute('aria-sort')).toBe('descending')
    // Label in name (WCAG 2.5.3): each sort button's name contains the text shown on it.
    for (const b of screen.getAllByRole('button', { name: /^Sort by/ })) expect(b.getAttribute('aria-label')).toContain(b.textContent!.replace(/[▲▼]/g, '').trim())
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Born or hatched' }))
    expect(firstCells().slice(0, 3)).toEqual(['2', '10', 'T3'])
  })

  it('shows MK and F only where given, says they are pedigree-based, and leaves the columns out when none are given', () => {
    render(<StudbookTable rows={rows} caption="Book" showAll />)
    expect(screen.getByText('Mean kinship and inbreeding are pedigree-based')).toBeTruthy()
    const t3 = bodyRows().find((r) => r.textContent!.startsWith('T3'))!
    expect(t3.textContent).toContain('Not shown to you')
    expect(bodyRows()[0]!.textContent).toContain('0.0500')
    expect(bodyRows()[0]!.textContent).toContain('0.0625')
    cleanup()
    const html = renderToStaticMarkup(<StudbookTable rows={rows.map(({ genetics, ...r }) => r)} caption="Book" />)
    expect(html).not.toContain('Mean kinship')
    expect(html).not.toContain('pedigree-based')
  })

  it('opens an animal from its number, and labels the scroll region and caption', () => {
    const onSelect = vi.fn()
    render(<StudbookTable rows={rows} caption="Book" currentness="Current to 2026-11-01" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '10' }))
    expect(onSelect).toHaveBeenCalledWith('a')
    expect(screen.getByRole('region', { name: 'Book' })).toBeTruthy()
    expect(screen.getByRole('table').querySelector('caption')!.textContent).toBe('Book · Current to 2026-11-01')
  })
})
