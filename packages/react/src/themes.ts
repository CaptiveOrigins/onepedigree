import type { PedigreeViewId } from '@extantape/onepedigree-core'
import type { CSSProperties } from 'react'

/** Colors a theme sets; each maps to a `--op-*` custom property. */
export const THEME_TOKENS = [
  'background',
  'nodeBackground',
  'nodeBorder',
  'label',
  'sublabel',
  'connector',
  'focalBorder',
  'selectedRing',
  'highlight',
  'cohortBorder',
  'junction',
  'fanFill',
  'fanFillAlt',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]
export type ThemeColors = Record<ThemeToken, string>

export const TOKEN_LABELS: Record<ThemeToken, string> = {
  background: 'Background',
  nodeBackground: 'Card',
  nodeBorder: 'Card border',
  label: 'Name text',
  sublabel: 'Detail text',
  connector: 'Lines',
  focalBorder: 'Focal individual',
  selectedRing: 'Selection',
  highlight: 'Highlight',
  cohortBorder: 'Cohort outline',
  junction: 'Junctions',
  fanFill: 'Fan rings',
  fanFillAlt: 'Fan rings (alternate)',
}

const VAR: Record<ThemeToken, string> = {
  background: '--op-background',
  nodeBackground: '--op-node-background',
  nodeBorder: '--op-node-border',
  label: '--op-label',
  sublabel: '--op-sublabel',
  connector: '--op-connector',
  focalBorder: '--op-focal-border',
  selectedRing: '--op-selected-ring',
  highlight: '--op-highlight',
  cohortBorder: '--op-cohort-border',
  junction: '--op-junction',
  fanFill: '--op-fan-fill',
  fanFillAlt: '--op-fan-fill-alt',
}

export type PedigreeTheme = {
  id: string
  label: string
  colors: ThemeColors
  /** Per-view adjustments on top of `colors` (e.g. warm maternal, cool paternal lines). */
  views?: Partial<Record<PedigreeViewId, Partial<ThemeColors>>>
}

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)

const theme = (id: string, label: string, colors: ThemeColors, views: PedigreeTheme['views']): PedigreeTheme => ({ id, label, colors, views })

/** Built-in presets, each with its own per-view accents. */
export const THEME_PRESETS: readonly PedigreeTheme[] = [
  theme(
    'classic',
    'Classic',
    {
      background: '#ffffff',
      nodeBackground: '#ffffff',
      nodeBorder: '#6b7a90',
      label: '#1d2330',
      sublabel: '#5b6577',
      connector: '#8892a6',
      focalBorder: '#2f7d5c',
      selectedRing: '#f0b35a',
      highlight: '#d97706',
      cohortBorder: '#9aa5b8',
      junction: '#5b6577',
      fanFill: '#eef2f7',
      fanFillAlt: '#e3e9f1',
    },
    {
      maternal: { focalBorder: '#b4436c', connector: '#c76b8e', nodeBorder: '#c76b8e' },
      paternal: { focalBorder: '#2b6cb0', connector: '#5a8fd0', nodeBorder: '#5a8fd0' },
      inbreeding: { highlight: '#c2410c' },
      relationship: { highlight: '#7c3aed' },
      fan: { fanFill: '#e8f1ec', fanFillAlt: '#d7e8de' },
      timeline: { connector: '#a7b0c0' },
      population: { connector: '#b4bccb' },
    },
  ),
  theme(
    'midnight',
    'Midnight',
    {
      background: '#0e1117',
      nodeBackground: '#161a22',
      nodeBorder: '#7dc4a5',
      label: '#eef1f6',
      sublabel: '#a7b0c0',
      connector: '#8892a6',
      focalBorder: '#7dc4a5',
      selectedRing: '#f0b35a',
      highlight: '#f59e0b',
      cohortBorder: '#4b5567',
      junction: '#c3cad6',
      fanFill: '#1d2330',
      fanFillAlt: '#232a37',
    },
    {
      maternal: { nodeBorder: '#f29bb9', connector: '#f29bb9', focalBorder: '#f29bb9' },
      paternal: { nodeBorder: '#8ab8f0', connector: '#8ab8f0', focalBorder: '#8ab8f0' },
      inbreeding: { highlight: '#fb923c' },
      relationship: { highlight: '#c4b5fd' },
      fan: { fanFill: '#18232a', fanFillAlt: '#1f2e35' },
    },
  ),
  theme(
    'forest',
    'Forest',
    {
      background: '#f6f8f3',
      nodeBackground: '#ffffff',
      nodeBorder: '#5d7a52',
      label: '#1f2a1c',
      sublabel: '#56654f',
      connector: '#8aa07e',
      focalBorder: '#2f5d2a',
      selectedRing: '#d9a441',
      highlight: '#b45309',
      cohortBorder: '#a3b398',
      junction: '#56654f',
      fanFill: '#e6efdf',
      fanFillAlt: '#d6e4cb',
    },
    {
      maternal: { nodeBorder: '#8f5e3b', connector: '#a8774f' },
      paternal: { nodeBorder: '#3d6b62', connector: '#5b8a80' },
      relationship: { highlight: '#9a3412' },
    },
  ),
  theme(
    'ocean',
    'Ocean',
    {
      background: '#f3f8fb',
      nodeBackground: '#ffffff',
      nodeBorder: '#4c7a99',
      label: '#122533',
      sublabel: '#4b6475',
      connector: '#7fa3bb',
      focalBorder: '#0f5e8c',
      selectedRing: '#f2a65a',
      highlight: '#e07a2e',
      cohortBorder: '#9fbccf',
      junction: '#4b6475',
      fanFill: '#e2eef6',
      fanFillAlt: '#d0e3ef',
    },
    {
      maternal: { nodeBorder: '#a35a8a', connector: '#bb7aa4' },
      paternal: { nodeBorder: '#1f6fa3', connector: '#4f92c0' },
      inbreeding: { highlight: '#c2410c' },
    },
  ),
  theme(
    'terracotta',
    'Terracotta',
    {
      background: '#fbf6f1',
      nodeBackground: '#fffdfa',
      nodeBorder: '#a0674a',
      label: '#2d1d14',
      sublabel: '#6e5446',
      connector: '#c49a83',
      focalBorder: '#8a3f1f',
      selectedRing: '#3f7f6f',
      highlight: '#3f7f6f',
      cohortBorder: '#d9bba8',
      junction: '#6e5446',
      fanFill: '#f5e6da',
      fanFillAlt: '#ecd5c4',
    },
    {
      maternal: { nodeBorder: '#b0546b', connector: '#c57789' },
      paternal: { nodeBorder: '#4f6f8a', connector: '#7290a8' },
    },
  ),
  theme(
    'high-contrast',
    'High contrast',
    {
      background: '#ffffff',
      nodeBackground: '#ffffff',
      nodeBorder: '#000000',
      label: '#000000',
      sublabel: '#1a1a1a',
      connector: '#000000',
      focalBorder: '#0000cc',
      selectedRing: '#cc0000',
      highlight: '#cc0000',
      cohortBorder: '#000000',
      junction: '#000000',
      fanFill: '#ffffff',
      fanFillAlt: '#e6e6e6',
    },
    {},
  ),
  theme(
    'print',
    'Print (grayscale)',
    {
      background: '#ffffff',
      nodeBackground: '#ffffff',
      nodeBorder: '#444444',
      label: '#000000',
      sublabel: '#333333',
      connector: '#555555',
      focalBorder: '#000000',
      selectedRing: '#000000',
      highlight: '#000000',
      cohortBorder: '#888888',
      junction: '#333333',
      fanFill: '#f2f2f2',
      fanFillAlt: '#e0e0e0',
    },
    {},
  ),
]

export const presetTheme = (id: string) => THEME_PRESETS.find((t) => t.id === id)

/** Colors for one view: preset, then its view accents, then the theme's own overrides; invalid hex values are ignored. */
export function resolveThemeColors(themeOrId: PedigreeTheme | string | undefined, view: PedigreeViewId): ThemeColors {
  const t = typeof themeOrId === 'string' ? presetTheme(themeOrId) : themeOrId
  // Invalid or missing values fall back to the theme's own preset (else Classic).
  const preset = (t && presetTheme(t.id)) ?? THEME_PRESETS[0]!
  const out = { ...preset.colors } as ThemeColors
  for (const layer of [preset !== t ? preset.views?.[view] : undefined, t?.colors, t?.views?.[view]])
    for (const k of THEME_TOKENS) {
      const v = layer?.[k]
      if (isHexColor(v)) out[k] = v
    }
  return out
}

/** Inline custom properties for a view (works in server rendering). No theme: none (the stylesheet decides). */
export function themeStyle(themeOrId: PedigreeTheme | string | undefined, view: PedigreeViewId): CSSProperties | undefined {
  if (!themeOrId) return undefined
  const colors = resolveThemeColors(themeOrId, view)
  return Object.fromEntries(THEME_TOKENS.map((k) => [VAR[k], colors[k]])) as CSSProperties
}

/** WCAG contrast ratio of two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x! + 0.05) / (y! + 0.05)
}
