import { describe, expect, it } from 'vitest'

import { lifeLabel, lifeSpan, parseGedcom, serializeGedcom, validatePedigree, yearOf } from '../src'

const SAMPLE = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Ada /Lovelace/
1 SEX F
1 BIRT
2 DATE 10 DEC 1815
2 PLAC London
1 FAMS @F1@
0 @I2@ INDI
1 NAME William /King/
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Byron /King/
1 SEX M
1 FAMC @F1@
1 NOTE First line
2 CONT second line
0 @I4@ INDI
1 NAME Foster /Child/
1 FAMC @F1@
2 PEDI foster
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
1 CHIL @I4@
0 TRLR`

describe('gedcom', () => {
  it('reads people, birth parentage from HUSB/WIFE, events and notes; foster links are not parentage', () => {
    const { document, warnings } = parseGedcom(SAMPLE)
    expect(warnings).toEqual([])
    const byId = Object.fromEntries(document.individuals.map((i) => [i.id, i]))
    expect(byId.I1).toMatchObject({ label: 'Ada Lovelace', sex: 'female', data: { gedcom: { surname: 'Lovelace', birth: { date: '10 DEC 1815', place: 'London' } } } })
    expect(byId.I3!.parentage?.parents).toEqual([
      { individual: 'I1', role: 'mother' },
      { individual: 'I2', role: 'father' },
    ])
    expect((byId.I3!.data as { gedcom: { notes: string[] } }).gedcom.notes).toEqual(['First line\nsecond line'])
    expect(byId.I4!.parentage).toBeNull()
    expect(validatePedigree(document).valid).toBe(true)
  })

  it('round-trips through GEDCOM', () => {
    const { document } = parseGedcom(SAMPLE)
    const again = parseGedcom(serializeGedcom(document)).document
    const by = (d: typeof document) => Object.fromEntries(d.individuals.map((i) => [i.label, i.parentage?.parents.map((p) => p.role) ?? []]))
    expect(by(again)).toEqual({ ...by(document), 'Foster Child': [] })
    expect(serializeGedcom(document)).toContain('1 NAME Ada /Lovelace/')
  })
})

describe('GEDCOM families and life years', () => {
  const text = [
    '0 HEAD',
    '0 @I1@ INDI', '1 NAME Ann /Smith/', '1 SEX F', '1 BIRT', '2 DATE ABT 1920', '1 DEAT', '2 DATE 3 MAR 1990',
    '0 @I2@ INDI', '1 NAME Bob /Smith/', '1 SEX M', '1 BIRT', '2 DATE 1918',
    '0 @I3@ INDI', '1 NAME Cal /Smith/', '1 FAMC @F1@', '1 FAMC @F2@', '1 FAMC @F3@', '1 BIRT', '2 DATE 12 JUN 1950',
    '0 @I4@ INDI', '1 NAME Dee /Jones/', '1 SEX F',
    '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 CHIL @I3@',
    '0 @F2@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 CHIL @I3@', // an exact duplicate
    '0 @F3@ FAM', '1 HUSB @I2@', '1 WIFE @I4@', '1 CHIL @I3@', // a different family
    '0 TRLR',
  ].join('\n')

  it('takes birth parents from one family, never combining families into extra parents', () => {
    const { document, warnings } = parseGedcom(text)
    const cal = document.individuals.find((i) => i.id === 'I3')!
    expect(cal.parentage).toEqual({ parents: [{ individual: 'I1', role: 'mother' }, { individual: 'I2', role: 'father' }] })
    expect((cal.data!.gedcom as { otherFamilies: unknown }).otherFamilies).toEqual([{ family: 'F3', relation: 'unrecorded' }])
    expect(warnings).toEqual(['1 person is a child of more than one family; the first family is used as birth parents (the others are kept with the person).'])
    // How a person was conceived isn't in GEDCOM: no reproductive mode, so no "incomplete parentage" notices.
    expect(validatePedigree(document).issues).toEqual([])
  })

  it('reads birth and death years for labels', () => {
    const { document } = parseGedcom(text)
    const label = (id: string) => lifeLabel(lifeSpan(document.individuals.find((i) => i.id === id)))
    expect([label('I1'), label('I2'), label('I3'), label('I4')]).toEqual(['1920 – 1990', '1918 – unknown', '1950 – unknown', ''])
    expect(yearOf('2024-07-01')).toBeCloseTo(2024.5, 1)
    expect(lifeLabel({ born: 2024, died: null, living: true })).toBe('2024 – present')
    expect(lifeLabel(lifeSpan({ id: 'x', data: { birthDate: '2024-05-14', status: 'alive' } }))).toBe('2024 – present')
  })
})
