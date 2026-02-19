import { Elysia } from 'elysia'
import { corsMiddleware } from './middleware/cors'
import { authPlugin } from './middleware/auth'
import { notesRoutes } from './routes/notes'

const app = new Elysia()
	.use(corsMiddleware)
	.use(authPlugin)
	.get('/health', () => ({ ok: true, ts: Date.now() }))
	.use(notesRoutes)
	.listen(process.env.PORT ? parseInt(process.env.PORT) : 3001)

console.log(`🦊 Skriuw API running at http://localhost:${app.server?.port}`)

export type App = typeof app
