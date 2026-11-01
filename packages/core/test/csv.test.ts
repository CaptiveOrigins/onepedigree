import { describe, expect, it } from 'vitest'

import { applyCompanion, emptyCompanion, parseCsv, parseGedcom } from '../src'

describe('csv', () => {
  it('finds breeder columns, keeps extras, and reports unknown parents', () => {
    const csv = 'ID,Name,Sex,Dam,Sire,Hatch date,Morph\nD1,Nova,F,,,2019,"Normal, het pied"\nS1,Atlas,M,,,2018,Pied\nH1,Ember,F,D1,S1,2023,\nH2,Ash,M,D1,X9,2023,\n'
    const { document, warnings, mapping } = parseCsv(csv)
    expect(mapping).toMatchObject({ id: 'ID', label: 'Name', sex: 'Sex', mother: 'Dam', father: 'Sire' })
    const h1 = document.individuals.find((i) => i.id === 'H1')!
    expect(h1.parentage?.parents).toEqual([
      { individual: 'D1', role: 'mother' },
      { individual: 'S1', role: 'father' },
    ])
    expect(document.individuals[0]!.data).toEqual({ 'Hatch date': '2019', Morph: 'Normal, het pied' })
    expect(warnings).toEqual(['H2: parent "X9" is not in the file; left unknown'])
  })

  it('uses dam/sire roles when asked, and reads TSV', () => {
    const { document } = parseCsv('id\tdam\tsire\na\t\t\nb\t\t\nc\ta\tb\n', { maternalRole: 'dam', paternalRole: 'sire' })
    expect(document.individuals[2]!.parentage?.parents.map((p) => p.role)).toEqual(['dam', 'sire'])
  })
})

describe('companion', () => {
  it('adds extras on top of a GEDCOM without changing it', () => {
    const { document } = parseGedcom('0 @I1@ INDI\n1 NAME Ada /Lovelace/\n0 TRLR')
    const c = emptyCompanion({ format: 'gedcom', file: 'family.ged' })
    c.individuals = { I1: { data: { color: '#c0ffee' } } }
    const merged = applyCompanion(document, c)
    expect(merged.individuals[0]!.data).toMatchObject({ color: '#c0ffee', gedcom: { surname: 'Lovelace' } })
    expect(document.individuals[0]!.data).not.toHaveProperty('color')
  })
})
