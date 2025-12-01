import '@/styles/global.css'
	import 'prismjs/themes/prism-tomorrow.css'

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

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
