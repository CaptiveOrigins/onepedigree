'use client'

import type { PedigreeViewId } from '@extantape/onepedigree-core'
import { useId, useState } from 'react'

import { VIEW_LABELS } from './describe.js'
import { contrastRatio, isHexColor, presetTheme, resolveThemeColors, THEME_PRESETS, THEME_TOKENS, TOKEN_LABELS, type PedigreeTheme, type ThemeToken } from './themes.js'

export type ThemeEditorProps = {
  value: PedigreeTheme
  /** The view being shown (for "this view only" changes and the preview of its accents). */
  view: PedigreeViewId
  onChange: (theme: PedigreeTheme) => void
  presets?: readonly PedigreeTheme[]
  labels?: Partial<Record<'title' | 'preset' | 'scope' | 'allViews' | 'thisView' | 'reset' | 'lowContrast' | 'invalid', string>>
}

const LABELS = {
  title: 'Colors',
  preset: 'Preset',
  scope: 'Apply changes to',
  allViews: 'All views',
  thisView: 'This view only',
  reset: 'Reset to preset',
  lowContrast: 'Low contrast with the card color',
  invalid: 'Use a hex color like #1d2330',
}
const full = (hex: string) => (hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex).toLowerCase()

/** Pick a preset and adjust any color with a color picker or hex code, for all views or the current one. */
export function ThemeEditor({ value, view, onChange, presets = THEME_PRESETS, labels: l }: ThemeEditorProps) {
  const labels = { ...LABELS, ...l }
  const id = useId()
  const [scope, setScope] = useState<'all' | 'view'>('all')
  const [drafts, setDrafts] = useState<Partial<Record<ThemeToken, string>>>({})
  const colors = resolveThemeColors(value, view)
  const base = presets.find((p) => p.id === value.id) ?? presetTheme(value.id)

  const set = (token: ThemeToken, hex: string) => {
    setDrafts((d) => ({ ...d, [token]: hex }))
    if (!isHexColor(hex)) return
    const color = full(hex)
    onChange(
      scope === 'all'
        ? { ...value, colors: { ...value.colors, [token]: color } }
        : { ...value, views: { ...value.views, [view]: { ...value.views?.[view], [token]: color } } },
    )
    setDrafts((d) => ({ ...d, [token]: undefined }))
  }

  return (
    <div className="op-theme-editor" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="op-theme-editor-title">
        {labels.title}
      </p>
      <label className="op-theme-row">
        <span>{labels.preset}</span>
        <select
          value={value.id}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value)
            if (p) onChange(structuredClone(p))
            setDrafts({})
          }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="op-theme-scope">
        <legend>{labels.scope}</legend>
        <label>
          <input type="radio" name={`${id}-scope`} checked={scope === 'all'} onChange={() => setScope('all')} /> {labels.allViews}
        </label>
        <label>
          <input type="radio" name={`${id}-scope`} checked={scope === 'view'} onChange={() => setScope('view')} /> {labels.thisView} ({VIEW_LABELS[view]})
        </label>
      </fieldset>
      {THEME_TOKENS.map((token) => {
        const shown = drafts[token] ?? colors[token]
        const invalid = drafts[token] !== undefined && !isHexColor(drafts[token])
        const low =
          (token === 'label' || token === 'sublabel' || token === 'nodeBackground') &&
          contrastRatio(token === 'nodeBackground' ? colors.label : colors[token], colors.nodeBackground) < (token === 'sublabel' ? 3 : 4.5)
        return (
          <div key={token} className="op-theme-row" data-token={token}>
            <label htmlFor={`${id}-${token}`}>{TOKEN_LABELS[token]}</label>
            <input type="color" aria-label={`${TOKEN_LABELS[token]} picker`} value={full(colors[token])} onChange={(e) => set(token, e.target.value)} />
            <input
              id={`${id}-${token}`}
              type="text"
              inputMode="text"
              spellCheck={false}
              maxLength={7}
              value={shown}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid || low ? `${id}-${token}-hint` : undefined}
              onChange={(e) => set(token, e.target.value.trim())}
            />
            {(invalid || low) && (
              <span id={`${id}-${token}-hint`} className="op-theme-hint">
                {invalid ? labels.invalid : labels.lowContrast}
              </span>
            )}
          </div>
        )
      })}
      {base && (
        <button
          type="button"
          onClick={() => {
            onChange(structuredClone(base))
            setDrafts({})
          }}
        >
          {labels.reset}
        </button>
      )}
    </div>
  )
}
