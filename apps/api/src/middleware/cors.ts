import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'

/**
 * CORS middleware plugin for the Elysia API server.
 * Allows requests from the Next.js web app and Tauri desktop app.
 */
export const corsMiddleware = new Elysia({ name: 'middleware/cors' }).use(
	cors({
		origin: [
			'http://localhost:3000',
			'http://localhost:3001',
			'tauri://localhost',
			'https://tauri.localhost',
			...(process.env.ALLOWED_ORIGINS
				? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
				: [])
		],
		credentials: true,
		allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
	})
)
