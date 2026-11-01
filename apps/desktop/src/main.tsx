import '@captiveorigins/onepedigree-react/styles.css'
import { createRoot } from 'react-dom/client'

import { App } from './App'

document.body.style.margin = '0'
document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
createRoot(document.getElementById('root')!).render(<App />)
