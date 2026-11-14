import { writeFileSync } from 'node:fs'

import { layoutSync, PEDIGREE_VIEWS, projectPedigree } from '@extantape/onepedigree-core'
import { PedigreeView, VIEW_LABELS } from '@extantape/onepedigree-react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DATASETS } from './fixtures'

/** Static gallery (server rendering only): every view of every dataset, for visual review and print. */
const sections = Object.entries(DATASETS).map(([name, d]) => {
  const views = PEDIGREE_VIEWS.map((view) => {
    const projection = projectPedigree(d.doc, { focalId: view === 'descendants' || view === 'hourglass' ? d.founder : d.focal, relatedId: d.related, view, includeSiblings: true })
    const svg = renderToStaticMarkup(<PedigreeView projection={projection} layout={layoutSync(projection)} idPrefix={`${name}-${view}`.replace(/\W+/g, '-')} />)
    const notes = projection.issues.map((i) => `<li>${i.code}</li>`).join('')
    return `<figure><figcaption>${VIEW_LABELS[view]}</figcaption><div class="frame">${svg}</div>${notes ? `<ul>${notes}</ul>` : ''}</figure>`
  })
  return `<section><h2>${name}</h2><div class="grid">${views.join('')}</div></section>`
})
writeFileSync(
  new URL('./gallery.html', import.meta.url),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OnePedigree gallery</title><link rel="stylesheet" href="styles.css"><style>
body{font:13px system-ui,sans-serif;margin:24px;background:#fff;color:#1d2330}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
figure{margin:0;border:1px solid #dde;border-radius:10px;padding:8px}.frame{height:300px}.frame svg{width:100%;height:100%}figcaption{font-weight:600;margin-bottom:4px}ul{margin:4px 0 0;padding-left:18px;color:#776}
</style></head><body><h1>OnePedigree gallery</h1>${sections.join('')}</body></html>`,
)
console.log('wrote dist/gallery.html')
