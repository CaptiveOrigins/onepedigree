import { describe, expect, it } from 'vitest'
import { estimateCode, PmxError, toPed, type Studbook, type StudbookAnimal } from '../src/index.js'

const day = (date: string) => ({ date, precision: 'exact' as const })
const animal = (id: string, n: string, over: Partial<StudbookAnimal> = {}): StudbookAnimal => ({
  id, studbookNumber: n, coId: `REG-A${n}`, animalId: `K-${n}`, sex: 'female', birthType: 'captive', birth: day('2020-05-01'), parentage: null, status: 'alive', ...over,
})
const wild = (role: string) => ({ role, kind: 'wild' as const, candidates: [] })
const book: Studbook = {
  title: 'Made-up tortoises', currentness: '2026-11-10',
  animals: [
    animal('a1', '1', { birthType: 'wild', birth: { date: '2010-07-01', precision: 'year' }, parentage: { parents: [], uncertainParents: [wild('mother'), wild('father')] } }),
    animal('a2', '2', { sex: 'male', birthType: 'wild', birth: { date: null, precision: 'unknown' }, parentage: { parents: [], uncertainParents: [wild('mother'), wild('father')] } }),
    animal('a3', '3', { parentage: { parents: [{ individual: 'a1', role: 'mother' }, { individual: 'a2', role: 'father' }] } }),
    animal('a4', '4', { sex: 'male', status: 'dead', parentage: { parents: [{ individual: 'a1', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [{ individual: 'a2', probability: 0.6 }, { individual: 'a5', probability: 0.4 }] }] } }),
    animal('a5', '5', { sex: 'male', birthType: 'wild', parentage: { parents: [], uncertainParents: [wild('mother'), wild('father')] } }),
    animal('a6', '6', { parentage: { parents: [{ individual: 'a1', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], shared: 'clutch-7' }] } }),
    animal('a7', '7', { parentage: { parents: [{ individual: 'a1', role: 'mother' }], uncertainParents: [{ role: 'father', candidates: [], shared: 'clutch-7' }] } }),
  ],
  events: [
    { animal: 'a4', type: 'birth', date: day('2020-05-01'), location: 'REG-G1', localId: 'L4' },
    { animal: 'a4', type: 'transfer', date: { date: '2022-06-16', precision: 'month' }, location: 'REG-G2' },
    { animal: 'a4', type: 'death', date: day('2024-01-02'), location: 'REG-G2', notes: 'cause: unknown; see vet' },
    { animal: 'a3', type: 'birth', date: day('2020-05-01'), location: 'REG-G1', localId: 'L3' },
  ],
}
const lines = (text: string) => text.trimEnd().split('\n')

describe('PMx .ped export (manual v1.0, pp. 139–141)', () => {
  it('writes the two header lines, the UDF line and one record per animal in studbook order', () => {
    const l = lines(toPed(book))
    expect(l.slice(0, 3)).toEqual(['Analysis date: 20261110', 'Number of animals: 7', 'UDFs: AnimalID'])
    expect(l.filter((x) => !x.startsWith('*')).slice(3).map((x) => x.split('; ')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('writes known parents by studbook number, sex codes, selected and dead flags, dates, and both IDs', () => {
    const l = lines(toPed(book))
    expect(l).toContain('3; 2; 1; 0; T; F; 20200501; ; REG-G1; L3; REG-A3; K-3')
    expect(l.find((x) => x.startsWith('2; '))).toBe('2; WILD; WILD; 1; T; F; ; ; ; ; REG-A2; K-2')
  })

  it('writes a MULT sire followed by its *SIRE probability lines', () => {
    const l = lines(toPed(book))
    const at = l.findIndex((x) => x.startsWith('4; '))
    expect(l[at]).toBe('4; MULT; 1; 1; F; T; 20200501; 20240102; REG-G2; ; REG-A4; K-4')
    expect(l.slice(at + 1, at + 3)).toEqual(['*SIRE: 2; 0.6', '*SIRE: 5; 0.4'])
  })

  it('gives clutchmates one shared unknown father, which PMx inserts as one founder', () => {
    const l = lines(toPed(book))
    expect(l.find((x) => x.startsWith('6; '))!.split('; ')[1]).toBe('UNK1')
    expect(l.find((x) => x.startsWith('7; '))!.split('; ')[1]).toBe('UNK1')
  })

  it('writes *MOVE lines: birth to export, import to death, with estimate codes and cleaned notes', () => {
    const l = lines(toPed(book))
    expect(l).toContain('*MOVE: 20200501; Exact; birth; 20220616; M; export; REG-G1; ')
    expect(l).toContain('*MOVE: 20220616; M; import; 20240102; Exact; death; REG-G2; ')
    expect(l).toContain('*MOVE: 20200501; Exact; birth; 20261110; Exact; alive; REG-G1; ')
  })

  it('names holders only through holderLabel, and refuses IDs PMx can\'t read', () => {
    expect(toPed(book, { holderLabel: (c) => `Holder ${c.slice(-1)}` })).toContain('; Holder 2; ')
    expect(toPed(book)).not.toContain('Holder')
    expect(() => toPed({ ...book, animals: [animal('x', '9;1')] })).toThrow(PmxError)
    expect(() => toPed({ ...book, animals: [animal('x', '9', { parentage: { parents: [{ individual: 'a1', role: null }] } })] })).toThrow(/sire or dam/)
  })

  it('maps date precision to PMx estimate codes', () => {
    expect([estimateCode({ date: '2020-01-01', precision: 'exact' }), estimateCode({ date: '2020-01-16', precision: 'month' }), estimateCode({ date: '2020-07-01', precision: 'year' }), estimateCode({ date: null, precision: 'unknown' }), estimateCode({ date: '2020-07-01', precision: 'range', plusMinusDays: 730 })]).toEqual(['Exact', 'M', 'Y', 'U', 'Y2'])
  })
})
