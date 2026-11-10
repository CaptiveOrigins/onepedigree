import { describe, expect, it } from 'vitest'
import { checkStudbookNumbers, isPermanentNumber, isTemporaryNumber, nextStudbookNumber, renumber, type NumberedAnimal } from '../src/index.js'

const a = (id: string, studbookNumber: string, oldNumbers?: string[]): NumberedAnimal => ({ id, studbookNumber, ...(oldNumbers ? { oldNumbers } : {}) })
const codes = (animals: NumberedAnimal[]) => checkStudbookNumbers(animals).map((i) => i.code)

describe('studbook number format', () => {
  it('permanent numbers are digits with no leading zero; temporary are T and digits', () => {
    for (const n of ['1', '10', '1203']) expect(isPermanentNumber(n)).toBe(true)
    for (const n of ['0', '01', '1A', 'A1', '1-2', ' 1', '', 'T1']) expect(isPermanentNumber(n)).toBe(false)
    for (const n of ['T1', 'T42']) expect(isTemporaryNumber(n)).toBe(true)
    for (const n of ['T', 'T0', 'T01', 't1', '1']) expect(isTemporaryNumber(n)).toBe(false)
  })
})

describe('next number', () => {
  it('starts at 1 and T1 in an empty studbook', () => {
    expect(nextStudbookNumber([])).toBe('1')
    expect(nextStudbookNumber([], { temporary: true })).toBe('T1')
  })
  it('continues past the highest number ever used, old numbers included, and counts permanent and temporary apart', () => {
    const book = [a('x', '3'), a('y', '7', ['T4']), a('z', 'T2', ['9'])]
    expect(nextStudbookNumber(book)).toBe('10')
    expect(nextStudbookNumber(book, { temporary: true })).toBe('T5')
  })
  it('compares numbers as numbers, not text', () => {
    expect(nextStudbookNumber([a('x', '9'), a('y', '10')])).toBe('11')
  })
})

describe('renumbering', () => {
  it('confirms a temporary number to the next permanent one and keeps T in oldNumbers', () => {
    const book = [a('x', '1'), a('t', 'T1')]
    const r = renumber(book, 't')
    expect(r.issues).toEqual([])
    expect(r.animal).toEqual({ id: 't', studbookNumber: '2', oldNumbers: ['T1'] })
  })
  it('takes a given unused number, such as the international one', () => {
    expect(renumber([a('x', '1'), a('t', 'T1')], 't', '512').animal.studbookNumber).toBe('512')
  })
  it('refuses a used, retired or malformed number and leaves the animal unchanged', () => {
    const book = [a('x', '1', ['T1']), a('t', 'T2')]
    for (const [to, code] of [['1', 'STUDBOOK_NUMBER_USED'], ['T1', 'STUDBOOK_NUMBER_USED'], ['01', 'INVALID_STUDBOOK_NUMBER'], ['2b', 'INVALID_STUDBOOK_NUMBER']] as const) {
      const r = renumber(book, 't', to)
      expect(r.animal).toBe(book[1])
      expect(r.issues.map((i) => i.code)).toEqual([code])
    }
  })
  it('notes when a permanent number is changed, and never gives it again', () => {
    const book = [a('x', '1'), a('y', '2')]
    const r = renumber(book, 'y', '40')
    expect(r.issues.map((i) => [i.severity, i.code])).toEqual([['notice', 'PERMANENT_NUMBER_CHANGED']])
    const after = [book[0]!, r.animal]
    expect(r.animal.oldNumbers).toEqual(['2'])
    expect(nextStudbookNumber(after)).toBe('41')
    expect(renumber(after, 'x', '2').issues[0]!.code).toBe('STUDBOOK_NUMBER_USED')
  })
  it('throws for an animal not in the studbook', () => {
    expect(() => renumber([], 'nope')).toThrow(/No animal/)
  })
})

describe('checking a whole studbook', () => {
  it('passes a clean book', () => {
    expect(checkStudbookNumbers([a('x', '1'), a('y', '2', ['T1']), a('z', 'T2')])).toEqual([])
  })
  it('catches malformed, duplicate and reused numbers', () => {
    expect(codes([a('x', '01')])).toContain('INVALID_STUDBOOK_NUMBER')
    expect(codes([a('x', '1'), a('y', '1')])).toEqual(['DUPLICATE_STUDBOOK_NUMBER'])
    expect(codes([a('x', '2', ['1']), a('y', '1')])).toEqual(['STUDBOOK_NUMBER_REUSED'])
    expect(codes([a('x', '2', ['T1']), a('y', '1', ['T1'])])).toEqual(['STUDBOOK_NUMBER_REUSED'])
    expect(codes([a('x', '1', ['1'])])).toEqual(['STUDBOOK_NUMBER_REUSED'])
  })
  it('notes gaps without failing, counting old numbers as used', () => {
    const issues = checkStudbookNumbers([a('x', '1'), a('y', '4', ['2'])])
    expect(issues.map((i) => [i.severity, i.code])).toEqual([['notice', 'STUDBOOK_NUMBER_GAP']])
    expect(issues[0]!.message).toMatch(/skip 3\./)
  })
})
