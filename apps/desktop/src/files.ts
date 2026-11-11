import {
  applyCompanion,
  companionMatches,
  emptyCompanion,
  isCompanion,
  parseCsv,
  parseGedcom,
  parsePedigree,
  serializeGedcom,
  serializePedigree,
  type Companion,
  type PedigreeDocument,
} from '@captiveorigins/onepedigree-core'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { exists, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'

/** How a project looks: view, theme, parent words, species; saved with the project. */
export type Display = {
  view?: string
  theme?: string
  parentTerms?: 'mother-father' | 'dam-sire' | 'female-male-parent'
  /** What the project is about, e.g. "Chelonoidis carbonarius" or "Humans". */
  species?: string
  focal?: string
  /** Second individual of the Relationship view. */
  related?: string
  generations?: number
}

/**
 * A project is either a OnePedigree JSON file (any species, fully editable, the
 * tree you build is saved in it) or a GEDCOM file (people) with a companion
 * JSON beside it that holds what GEDCOM can't: extra fields and display
 * settings. The GEDCOM itself is never changed.
 */
export type Project =
  | { kind: 'json'; path: string | null; doc: PedigreeDocument; display: Display; warnings: string[] }
  | { kind: 'gedcom'; sourcePath: string; companionPath: string; source: PedigreeDocument; sha256: string; companion: Companion; warnings: string[] }

export const projectDoc = (p: Project) => (p.kind === 'json' ? p.doc : applyCompanion(p.source, p.companion))
export const projectDisplay = (p: Project): Display => (p.kind === 'json' ? p.display : ((p.companion.display ?? {}) as Display))
export const projectTitle = (p: Project) => baseName(p.kind === 'json' ? (p.path ?? 'Untitled') : p.sourcePath)

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

/**
 * Atomic: a crash while saving leaves the old file or the new one, never half of one. If the write or the rename
 * fails, the temporary file is removed and the original error is still reported. If it can't be removed either,
 * the error says so, so a leftover `.tmp` file is never a surprise.
 */
async function writeFileSafely(path: string, text: string) {
  const temp = `${path}.tmp`
  try {
    await writeTextFile(temp, text)
    await rename(temp, path)
  } catch (error) {
    try {
      if (await exists(temp)) await remove(temp)
    } catch (cleanup) {
      throw new Error(`${sentence(describe(error))} The temporary file ${temp} couldn't be removed either (${describe(cleanup)}); you can delete it.`, { cause: error })
    }
    throw error
  }
}

/** A file is at the companion's path, but it isn't a companion this app wrote, so it must not be replaced. */
export class ForeignCompanionError extends Error {
  constructor(readonly path: string) {
    super(`${baseName(path)} is already there and isn't a OnePedigree companion file, so it wasn't replaced.`)
    this.name = 'ForeignCompanionError'
  }
}

/**
 * What's at a companion path: nothing, a companion, or a file this app didn't write. A file that can't be read
 * or parsed counts as foreign, so a doubt never ends with the file overwritten.
 */
async function companionAt(path: string): Promise<'none' | 'companion' | 'foreign'> {
  if (!(await exists(path))) return 'none'
  try {
    return isCompanion(JSON.parse(await readTextFile(path))) ? 'companion' : 'foreign'
  } catch {
    return 'foreign'
  }
}

const baseName = (path: string) => path.split('/').pop() ?? path
const dirName = (path: string) => path.slice(0, path.lastIndexOf('/'))
const companionPathFor = (gedcomPath: string) => gedcomPath.replace(/\.(ged|gedcom)$/i, '') + '.companion.json'

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newProject(species = ''): Project {
  return { kind: 'json', path: null, doc: { schemaVersion: 1, individuals: [] }, display: { species, parentTerms: 'mother-father', view: 'pedigree' }, warnings: [] }
}

/** `companionPath` is the companion beside it by default, or the one the person opened to get here. */
async function openGedcom(path: string, companionPath = companionPathFor(path)): Promise<Project> {
  const text = await readTextFile(path)
  const hash = await sha256(text)
  const { document, warnings } = parseGedcom(text)
  let companion = emptyCompanion({ format: 'gedcom', file: baseName(path), sha256: hash })
  // GEDCOM is for people: human words by default.
  companion.display = { parentTerms: 'mother-father', species: 'Humans', view: 'pedigree' }
  const found = await companionAt(companionPath)
  if (found === 'companion') {
    const saved = JSON.parse(await readTextFile(companionPath)) as Companion
    companion = saved
    if (!companionMatches(saved, hash)) warnings.push('The GEDCOM changed since its companion was saved; extras for people no longer in it are ignored.')
    companion.source.sha256 = hash
  } else if (found === 'foreign') {
    warnings.push(`${baseName(companionPath)} is already there and isn't a OnePedigree companion file. It won't be changed: when you save, you'll be asked where to keep your extras instead.`)
  }
  return { kind: 'gedcom', sourcePath: path, companionPath, source: document, sha256: hash, companion, warnings }
}

/** Open any supported file: OnePedigree JSON, a companion (opens its GEDCOM), GEDCOM, or CSV/TSV (becomes a new JSON project). */
export async function openPath(path: string): Promise<Project> {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ged') || lower.endsWith('.gedcom')) return openGedcom(path)
  const text = await readTextFile(path)
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const { document, warnings } = parseCsv(text)
    return { kind: 'json', path: null, doc: document, display: { parentTerms: 'dam-sire', view: 'pedigree' }, warnings: [`Imported from ${baseName(path)}; save it as a OnePedigree file.`, ...warnings] }
  }
  const raw = JSON.parse(text) as Record<string, unknown>
  if (isCompanion(raw)) return openGedcom(`${dirName(path)}/${raw.source.file}`, path)
  return { kind: 'json', path, doc: parsePedigree(text), display: (raw.display ?? {}) as Display, warnings: [] }
}

export async function pickAndOpen(): Promise<Project | null> {
  const path = await openDialog({
    multiple: false,
    filters: [
      { name: 'Pedigrees', extensions: ['json', 'ged', 'gedcom', 'csv', 'tsv'] },
      { name: 'OnePedigree JSON', extensions: ['json'] },
      { name: 'GEDCOM', extensions: ['ged', 'gedcom'] },
      { name: 'Spreadsheet (CSV/TSV)', extensions: ['csv', 'tsv', 'txt'] },
    ],
  })
  return typeof path === 'string' ? openPath(path) : null
}

/**
 * Save: a JSON project to its file (asking where the first time); a GEDCOM project's companion. A companion is
 * never written over a file that isn't one (`ForeignCompanionError`). With `saveAs`, the person picks another
 * companion file; it must sit beside the GEDCOM, because a companion names its GEDCOM by file name only.
 */
export async function saveProject(p: Project, saveAs = false): Promise<Project | null> {
  if (p.kind === 'gedcom') {
    let companionPath = p.companionPath
    if (saveAs) {
      const stem = baseName(p.sourcePath).replace(/\.(ged|gedcom)$/i, '')
      const chosen = await saveDialog({ defaultPath: `${dirName(p.sourcePath)}/${stem}.extras.companion.json`, filters: [{ name: 'OnePedigree companion', extensions: ['json'] }] })
      if (!chosen) return null
      if (dirName(chosen) !== dirName(p.sourcePath)) throw new Error(`Save the companion in the same folder as ${baseName(p.sourcePath)}, so it can find the GEDCOM.`)
      companionPath = chosen
    }
    if ((await companionAt(companionPath)) === 'foreign') throw new ForeignCompanionError(companionPath)
    await writeFileSafely(companionPath, `${JSON.stringify(p.companion, null, 2)}\n`)
    return { ...p, companionPath }
  }
  let path = p.path
  if (!path || saveAs) {
    const chosen = await saveDialog({ defaultPath: path ?? 'pedigree.json', filters: [{ name: 'OnePedigree JSON', extensions: ['json'] }] })
    if (!chosen) return null
    path = chosen
  }
  const body = { ...(JSON.parse(serializePedigree(p.doc)) as object), display: p.display }
  await writeFileSafely(path, `${JSON.stringify(body, null, 2)}\n`)
  return { ...p, path }
}

export async function exportAs(p: Project, format: 'gedcom' | 'json') {
  const doc = projectDoc(p)
  const name = projectTitle(p).replace(/\.(json|ged|gedcom)$/i, '')
  const path = await saveDialog({
    defaultPath: `${name}.${format === 'gedcom' ? 'ged' : 'json'}`,
    filters: [format === 'gedcom' ? { name: 'GEDCOM', extensions: ['ged'] } : { name: 'OnePedigree JSON', extensions: ['json'] }],
  })
  if (!path) return
  await writeFileSafely(path, format === 'gedcom' ? serializeGedcom(doc) : `${JSON.stringify({ ...(JSON.parse(serializePedigree(doc)) as object), display: projectDisplay(p) }, null, 2)}\n`)
}
