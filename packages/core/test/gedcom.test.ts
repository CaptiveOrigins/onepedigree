import { describe, expect, it } from 'vitest'

import { parseGedcom, serializeGedcom, validatePedigree } from '../src'

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
