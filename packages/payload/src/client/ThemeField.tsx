'use client'

import '@extantape/onepedigree-react/styles.css'

import type { PedigreeViewId } from '@extantape/onepedigree-core'
import { ThemeEditor, THEME_PRESETS, VIEW_LABELS, type PedigreeTheme } from '@extantape/onepedigree-react'
import { useField } from '@payloadcms/ui'
import { useState } from 'react'

/** Admin: the color theme of pedigree views (preset + hex adjustments), stored as JSON. */
export function ThemeField({ path }: { path: string }) {
  const { value, setValue } = useField<PedigreeTheme | null>({ path })
  const [view, setView] = useState<PedigreeViewId>('pedigree')
  const theme = value && typeof value === 'object' && 'colors' in value ? value : structuredClone(THEME_PRESETS[0]!)
  return (
    <div className="field-type onepedigree-theme-field" style={{ maxWidth: '24rem', marginBottom: 'var(--base, 20px)' }}>
      <label className="field-label" htmlFor="onepedigree-theme-view">
        Preview colors for
      </label>
      <select id="onepedigree-theme-view" value={view} onChange={(e) => setView(e.target.value as PedigreeViewId)}>
        {(Object.keys(VIEW_LABELS) as PedigreeViewId[]).map((v) => (
          <option key={v} value={v}>
            {VIEW_LABELS[v]}
          </option>
        ))}
      </select>
      <ThemeEditor value={theme} view={view} onChange={(t) => setValue(t)} />
    </div>
  )
}
