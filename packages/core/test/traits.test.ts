import { describe, expect, it } from 'vitest'
import { carrierFromOffspring, checkOffspring, expectedNormalLookingRecord, morphName, pairingOdds, type TraitDefinition, type TraitRecord } from '../src'

// Generic test catalog (letters, not real morphs: inheritance arithmetic only).
const catalog: TraitDefinition[] = [
  { id: 'rec', label: 'Rec', mode: 'recessive' },
  { id: 'inc', label: 'Inc', mode: 'incomplete-dominant', superLabel: 'Super' },
  { id: 'dom', label: 'Dom', mode: 'dominant' },
  { id: 'cxA', label: 'CxA', mode: 'incomplete-dominant', locus: 'cx' },
  { id: 'cxB', label: 'CxB', mode: 'incomplete-dominant', locus: 'cx' },
  { id: 'zr', label: 'Zr', mode: 'recessive', linkage: 'Z' },
  { id: 'poly', label: 'Poly', mode: 'polygenic' },
]
const r = (trait: string, state: TraitRecord['state'], probability?: number): TraitRecord => ({ trait, state, ...(probability !== undefined ? { probability } : {}) })
const odds = (m: TraitRecord[], f: TraitRecord[], ids: string[], ms?: 'homogametic' | 'heterogametic', fs?: 'homogametic' | 'heterogametic') =>
  pairingOdds(catalog, { records: m, ...(ms ? { sex: ms } : {}) }, { records: f, ...(fs ? { sex: fs } : {}) }, ids)
const pct = (o: ReturnType<typeof odds>[number]) => (o.calculable ? o.classes.map((c) => `${c.sex ? c.sex[0] + ':' : ''}${c.traits.map((t) => `${t.trait}=${t.state}`).join('+') || 'normal'} ${Math.round(c.probability * 1000) / 10}`) : [o.reason])

describe('heritable traits', () => {
  it('recessive: het × het gives 25 / 50 / 25 and 66% possible hets', () => {
    const [o] = odds([r('rec', 'het')], [r('rec', 'het')], ['rec'])
    expect(pct(o!)).toEqual(['rec=het 50', 'rec=visual 25', 'normal 25'])
    expect(expectedNormalLookingRecord(catalog, 'rec', o!)).toEqual({ trait: 'rec', state: 'possible-het', probability: 0.67, basis: 'inferred' })
    const [o2] = odds([r('rec', 'visual')], [r('rec', 'non-carrier')], ['rec'])
    expect(expectedNormalLookingRecord(catalog, 'rec', o2!)).toEqual({ trait: 'rec', state: 'het', basis: 'inferred' })
    const [o3] = odds([r('rec', 'possible-het', 0.5)], [r('rec', 'visual')], ['rec'])
    expect(pct(o3!)).toEqual(['rec=het 75', 'rec=visual 25'])
  })

  it('incomplete dominant: single × single gives supers; unrecorded genes are assumed absent and said so', () => {
    const [o] = odds([r('inc', 'single')], [], ['inc'])
    expect(pct(o!)).toEqual(['inc=single 50', 'normal 50'])
    expect(o!.calculable && o!.assumptions.map((a) => a.note)).toEqual(['Inc: not recorded, taken as not carried'])
    expect(pct(odds([r('inc', 'single')], [r('inc', 'single')], ['inc'])[0]!)).toEqual(['inc=single 50', 'inc=super 25', 'normal 25'])
    expect(morphName(catalog, [r('inc', 'super'), r('rec', 'possible-het', 0.66)])).toBe('Super Inc 66% possible het Rec')
  })

  it('allelic complex: two alleles of one gene combine, never three copies', () => {
    const [o] = odds([r('cxA', 'single')], [r('cxB', 'single')], ['cxA'])
    expect(pct(o!)).toEqual(['cxA=single+cxB=single 25', 'cxA=single 25', 'cxB=single 25', 'normal 25'])
    expect(odds([r('cxA', 'super'), r('cxB', 'single')], [], ['cxA'])[0]).toMatchObject({ calculable: false })
  })

  it('sex-linked recessive (ZW): visual father × normal mother gives visual daughters and het sons', () => {
    const [o] = odds([r('zr', 'non-carrier')], [r('zr', 'visual')], ['zr'], 'heterogametic', 'homogametic')
    expect(o!.calculable && o!.classes.map((c) => [c.sex, c.traits[0]?.state, c.probability])).toEqual([
      ['heterogametic', 'visual', 0.5],
      ['homogametic', 'het', 0.5],
    ])
    expect(odds([r('zr', 'het')], [], ['zr'], 'heterogametic', 'homogametic')[0]).toMatchObject({ calculable: false }) // a hemizygous female can't be het
    expect(odds([], [], ['zr'])[0]).toMatchObject({ calculable: false, reason: 'Mother: Sex-linked: the sex is needed' })
  })

  it('refuses odds for polygenic traits', () => {
    expect(odds([r('poly', 'visual')], [], ['poly'])[0]).toMatchObject({ calculable: false })
  })

  it('flags impossible offspring and suggests carriers from offspring (inferred, never saved)', () => {
    const m = { records: [r('rec', 'non-carrier')] }
    const f = { records: [r('rec', 'het')] }
    expect(checkOffspring(catalog, m, f, { records: [r('rec', 'visual')] }).map((i) => i.code)).toEqual(['impossible-offspring'])
    expect(checkOffspring(catalog, m, f, { records: [r('rec', 'het')] })).toEqual([])
    expect(checkOffspring(catalog, { records: [] }, f, { records: [r('rec', 'visual')] })).toEqual([]) // unknown parent: no judgement
    expect(carrierFromOffspring(catalog, { records: [] }, [{ records: [r('rec', 'visual')] }])).toEqual([{ trait: 'rec', state: 'het', basis: 'inferred' }])
    expect(carrierFromOffspring(catalog, { records: [r('rec', 'visual')] }, [{ records: [r('rec', 'visual')] }])).toEqual([])
    // Sex-linked: a visual hemizygous daughter proves her father (homogametic) carries it; says nothing about her mother.
    expect(carrierFromOffspring(catalog, { records: [], sex: 'homogametic' }, [{ records: [r('zr', 'visual')], sex: 'heterogametic' }])).toEqual([{ trait: 'zr', state: 'het', basis: 'inferred' }])
    expect(carrierFromOffspring(catalog, { records: [], sex: 'heterogametic' }, [{ records: [r('zr', 'visual')], sex: 'heterogametic' }])).toEqual([])
  })
})
