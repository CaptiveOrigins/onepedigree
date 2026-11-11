import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = new Map<string, string>()
const writes: string[] = []
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async (path: string) => disk.has(path)),
  readTextFile: vi.fn(async (path: string) => disk.get(path)!),
  writeTextFile: vi.fn(async (path: string, text: string) => { writes.push(path); disk.set(path, text) }),
  rename: vi.fn(async (from: string, to: string) => { writes.push(`${from} -> ${to}`); disk.set(to, disk.get(from)!); disk.delete(from) }),
  remove: vi.fn(async (path: string) => { writes.push(`remove ${path}`); disk.delete(path) }),
}))

const { ForeignCompanionError, openPath, saveProject } = await import('../src/files')

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

describe('a file in the companion\'s place', () => {
  beforeEach(() => { disk.clear(); writes.length = 0; disk.set('/made-up/family.ged', GEDCOM) })

  for (const [what, text] of [['JSON that isn\'t a companion', '{"notes": "mine"}\n'], ['a file that isn\'t JSON', 'my own notes\n']] as const) {
    it(`is never overwritten when it holds ${what}: the save is refused and says why`, async () => {
      disk.set('/made-up/family.companion.json', text)
      const project = await openPath('/made-up/family.ged')
      expect(project.warnings.join(' ')).toMatch(/family\.companion\.json is already there and isn't a OnePedigree companion file/)
      await expect(saveProject(project)).rejects.toBeInstanceOf(ForeignCompanionError)
      await expect(saveProject(project)).rejects.toThrow(/wasn't replaced/)
      expect(disk.get('/made-up/family.companion.json')).toBe(text)
      expect(writes).toEqual([])
    })
  }

  it('is refused even when it appears after the GEDCOM was opened', async () => {
    const project = await openPath('/made-up/family.ged')
    disk.set('/made-up/family.companion.json', '[1, 2, 3]\n')
    await expect(saveProject(project)).rejects.toBeInstanceOf(ForeignCompanionError)
    expect(disk.get('/made-up/family.companion.json')).toBe('[1, 2, 3]\n')
  })

  it('lets the person keep their extras in another companion beside the GEDCOM, which opens it back', async () => {
    const dialog = await import('@tauri-apps/plugin-dialog')
    disk.set('/made-up/family.companion.json', 'my own notes\n')
    const opened = await openPath('/made-up/family.ged')
    if (opened.kind !== 'gedcom') throw new Error('expected a GEDCOM project')
    const project = { ...opened, companion: { ...opened.companion, individuals: { I1: { data: { note: 'kept' } } } } }
    vi.mocked(dialog.save).mockResolvedValueOnce('/made-up/family.extras.companion.json')
    const saved = await saveProject(project, true)
    expect(saved?.kind === 'gedcom' && saved.companionPath).toBe('/made-up/family.extras.companion.json')
    expect(disk.get('/made-up/family.companion.json')).toBe('my own notes\n')
    expect(disk.get('/made-up/family.ged')).toBe(GEDCOM)
    const back = await openPath('/made-up/family.extras.companion.json')
    expect(back.kind === 'gedcom' && back.sourcePath).toBe('/made-up/family.ged')
    expect(back.kind === 'gedcom' && back.companionPath).toBe('/made-up/family.extras.companion.json')
    expect(back.kind === 'gedcom' && back.companion.individuals).toEqual({ I1: { data: { note: 'kept' } } })
  })

  it('refuses a chosen file that isn\'t a companion, the GEDCOM included, or one in another folder', async () => {
    const dialog = await import('@tauri-apps/plugin-dialog')
    const project = await openPath('/made-up/family.ged')
    vi.mocked(dialog.save).mockResolvedValueOnce('/made-up/family.ged')
    await expect(saveProject(project, true)).rejects.toBeInstanceOf(ForeignCompanionError)
    vi.mocked(dialog.save).mockResolvedValueOnce('/elsewhere/family.companion.json')
    await expect(saveProject(project, true)).rejects.toThrow(/same folder/)
    expect(disk.get('/made-up/family.ged')).toBe(GEDCOM)
    expect(writes).toEqual([])
  })

  it('replaces a companion this app wrote', async () => {
    await saveProject(await openPath('/made-up/family.ged'))
    writes.length = 0
    await saveProject(await openPath('/made-up/family.ged'))
    expect(writes).toEqual(['/made-up/family.companion.json.tmp', '/made-up/family.companion.json.tmp -> /made-up/family.companion.json'])
  })
})

describe('saving', () => {
  it('removes the temporary file when the rename fails, and reports the original error', async () => {
    const fs = await import('@tauri-apps/plugin-fs')
    disk.clear(); writes.length = 0
    disk.set('/made-up/p.json', 'old')
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('permission denied'))
    const project = { kind: 'json' as const, path: '/made-up/p.json', doc: { schemaVersion: 1 as const, individuals: [] }, display: {}, warnings: [] }
    await expect(saveProject(project)).rejects.toThrow(/^permission denied$/)
    expect(writes).toEqual(['/made-up/p.json.tmp', 'remove /made-up/p.json.tmp'])
    expect([...disk]).toEqual([['/made-up/p.json', 'old']])
  })

  it("says so when the temporary file can't be removed either, keeping the original error", async () => {
    const fs = await import('@tauri-apps/plugin-fs')
    disk.clear(); writes.length = 0
    // Tauri reports errors as plain strings.
    vi.mocked(fs.rename).mockRejectedValueOnce('permission denied')
    vi.mocked(fs.remove).mockRejectedValueOnce(new Error('read-only volume'))
    const project = { kind: 'json' as const, path: '/made-up/p.json', doc: { schemaVersion: 1 as const, individuals: [] }, display: {}, warnings: [] }
    const error = await saveProject(project).then(() => null, (e: unknown) => e as Error)
    expect(error?.message).toBe("permission denied. The temporary file /made-up/p.json.tmp couldn't be removed either (read-only volume); you can delete it.")
    expect(error?.cause).toBe('permission denied')
  })

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
