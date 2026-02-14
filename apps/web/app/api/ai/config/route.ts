import { requireAuth } from '@/lib/api-auth'
import { AIConfigCreateSchema, AIConfigPatchSchema } from '@skriuw/core'
import { getDatabase, aiProviderConfig, eq, and } from '@skriuw/db'
import { NextResponse } from 'next/server'
import { encryptPrompt, decryptPrompt } from '@/features/ai/utilities'
import { z } from 'zod'

function invalidPayload(error: z.ZodError) {
	return NextResponse.json(
		{
			error: 'Invalid payload',
			details: error.flatten()
		},
		{ status: 400 }
	)
}

export async function GET() {
	const auth = await requireAuth()
	if (!auth.authenticated) return auth.response
	const { userId } = auth

	const db = getDatabase()
	const configs = await db
		.select()
		.from(aiProviderConfig)
		.where(and(eq(aiProviderConfig.userId, userId), eq(aiProviderConfig.isActive, true)))
		.limit(1)

	if (configs.length === 0) {
		return NextResponse.json(null)
	}

	const config = configs[0]

	return NextResponse.json({
		id: config.id,
		provider: config.provider,
		model: config.model,
		basePrompt: config.basePrompt ? decryptPrompt(config.basePrompt) : null,
		temperature: config.temperature ?? 70,
		isActive: config.isActive
	})
}

export async function POST(request: Request) {
	const auth = await requireAuth()
	if (!auth.authenticated) return auth.response
	const { userId } = auth

	const body = await request.json()
	const parsed = AIConfigCreateSchema.safeParse(body)
	if (!parsed.success) return invalidPayload(parsed.error)
	const { provider, model, basePrompt, temperature } = parsed.data

	const now = Date.now()
	const db = getDatabase()

	// Check if config already exists
	const existingConfigs = await db
		.select()
		.from(aiProviderConfig)
		.where(eq(aiProviderConfig.userId, userId))
		.limit(1)

	const isUpdate = existingConfigs.length > 0
	const configId = isUpdate ? existingConfigs[0].id : crypto.randomUUID()

	if (isUpdate) {
		await db
			.update(aiProviderConfig)
			.set({
				provider,
				model,
				basePrompt: basePrompt ? encryptPrompt(basePrompt) : null,
				temperature,
				isActive: true,
				updatedAt: now
			})
			.where(eq(aiProviderConfig.id, configId))
	} else {
		await db.insert(aiProviderConfig).values({
			id: configId,
			userId,
			provider,
			model,
			basePrompt: basePrompt ? encryptPrompt(basePrompt) : null,
			temperature,
			isActive: true,
			createdAt: now,
			updatedAt: now
		})
	}

	return NextResponse.json({
		id: configId,
		provider,
		model,
		basePrompt,
		temperature,
		isActive: true
	})
}

export async function PATCH(request: Request) {
	const auth = await requireAuth()
	if (!auth.authenticated) return auth.response
	const { userId } = auth

	const body = await request.json()
	const parsed = AIConfigPatchSchema.safeParse(body)
	if (!parsed.success) return invalidPayload(parsed.error)
	const payload = parsed.data
	const updates: Record<string, unknown> = { updatedAt: Date.now() }

	if (payload.provider !== undefined) updates.provider = payload.provider
	if (payload.model !== undefined) updates.model = payload.model
	if (payload.temperature !== undefined) updates.temperature = payload.temperature
	if (payload.basePrompt !== undefined) {
		updates.basePrompt = payload.basePrompt ? encryptPrompt(payload.basePrompt) : null
	}

	const db = getDatabase()
	const configs = await db
		.select()
		.from(aiProviderConfig)
		.where(eq(aiProviderConfig.userId, userId))
		.limit(1)

	if (!configs[0]) {
		return NextResponse.json({ error: 'Config not found' }, { status: 404 })
	}

	await db.update(aiProviderConfig).set(updates).where(eq(aiProviderConfig.id, configs[0].id))

	const updatedConfig = { ...configs[0], ...payload }

	return NextResponse.json({
		id: updatedConfig.id,
		provider: updatedConfig.provider,
		model: updatedConfig.model,
		basePrompt:
			payload.basePrompt !== undefined
				? payload.basePrompt
				: configs[0].basePrompt
					? decryptPrompt(configs[0].basePrompt)
					: null,
		temperature: updatedConfig.temperature,
		isActive: updatedConfig.isActive
	})
}
