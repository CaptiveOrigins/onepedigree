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
})
