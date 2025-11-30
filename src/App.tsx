// Import polyfills FIRST before any other code
import '@/utils/process-polyfill'
import '@/utils/buffer-polyfill'

import '@/styles/global.css'

import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { Providers } from './app/providers'
import { AppRoutes } from './app/routing'

const App = () => (
    <Providers>
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    </Providers>
)

const rootElement = document.getElementById('root')
if (rootElement) {
        createRoot(rootElement).render(<App />)
} else {
        throw new Error('Root element not found')
}
