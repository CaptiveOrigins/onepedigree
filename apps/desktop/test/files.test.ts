import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = new Map<string, string>()
const writes: string[] = []
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async (path: string) => disk.has(path)),
  readTextFile: vi.fn(async (path: string) => disk.get(path)!),
  writeTextFile: vi.fn(async (path: string, text: string) => { writes.push(path); disk.set(path, text) }),
  rename: vi.fn(async (from: string, to: string) => { writes.push(`${from} -> ${to}`); disk.set(to, disk.get(from)!); disk.delete(from) }),
}))

const { openPath, saveProject } = await import('../src/files')

const GEDCOM = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Made-up /Person/
1 SEX F
0 TRLR
`

describe('a GEDCOM project', () => {
  beforeEach(() => { disk.clear(); writes.length = 0; disk.set('/made-up/family.ged', GEDCOM) })

  it('saves only its companion, beside it, and never changes the GEDCOM', async () => {
    const project = await openPath('/made-up/family.ged')
    expect(project.kind).toBe('gedcom')
    await saveProject(project)
    expect(disk.get('/made-up/family.ged')).toBe(GEDCOM)
    expect(writes).toEqual(['/made-up/family.companion.json.tmp', '/made-up/family.companion.json.tmp -> /made-up/family.companion.json'])
    expect(disk.has('/made-up/family.companion.json.tmp')).toBe(false)
  })

  it('warns when the GEDCOM changed since its companion was saved', async () => {
    await saveProject(await openPath('/made-up/family.ged'))
    disk.set('/made-up/family.ged', GEDCOM.replace('Made-up', 'Changed'))
    expect((await openPath('/made-up/family.ged')).warnings.join(' ')).toMatch(/changed since its companion/)
  })
})

describe('saving', () => {
  it('leaves the old file alone when writing fails', async () => {
    const fs = await import('@tauri-apps/plugin-fs')
    disk.set('/made-up/p.json', 'old')
    vi.mocked(fs.writeTextFile).mockRejectedValueOnce(new Error('disk full'))
    const project = { kind: 'json' as const, path: '/made-up/p.json', doc: { schemaVersion: 1 as const, individuals: [] }, display: {}, warnings: [] }
    await expect(saveProject(project)).rejects.toThrow(/disk full/)
    expect(disk.get('/made-up/p.json')).toBe('old')
  })

  it('keeps every animal, parent and display setting through a save and reopen', async () => {
    disk.clear()
    const doc = { schemaVersion: 1 as const, individuals: [{ id: 'd', label: 'Nova', sex: 'female' as const }, { id: 'c', label: 'Ember', parentage: { parents: [{ individual: 'd', role: 'dam' }] } }] }
    const display = { parentTerms: 'dam-sire' as const, species: 'Made-up species', view: 'fan' }
    await saveProject({ kind: 'json', path: '/made-up/p.json', doc, display, warnings: [] })
    const back = await openPath('/made-up/p.json')
    // Saved in normalized form (sorted, unknowns written as null), with nothing lost.
    const byId = new Map(back.kind === 'json' ? back.doc.individuals.map((i) => [i.id, i]) : [])
    expect(byId.size).toBe(2)
    for (const i of doc.individuals) expect(byId.get(i.id)).toMatchObject(i)
    expect(back.kind === 'json' && back.display).toEqual(display)
  })

  it('never saves over an imported spreadsheet: it asks where, and a cancel writes nothing', async () => {
    const dialog = await import('@tauri-apps/plugin-dialog')
    disk.clear(); writes.length = 0
    disk.set('/made-up/animals.csv', 'ID,Dam,Sire\nD1,,\nH1,D1,\n')
    const project = await openPath('/made-up/animals.csv')
    expect(project.kind === 'json' && project.path).toBeNull()
    vi.mocked(dialog.save).mockResolvedValueOnce(null)
    expect(await saveProject(project)).toBeNull()
    expect(vi.mocked(dialog.save)).toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(disk.get('/made-up/animals.csv')).toBe('ID,Dam,Sire\nD1,,\nH1,D1,\n')
  })
})
