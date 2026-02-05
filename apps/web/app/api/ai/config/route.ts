import { auth } from '@/lib/auth'
import { readOne, readMany, create, update } from '@skriuw/crud'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { encryptPrompt, decryptPrompt } from '@/features/ai/utilities'
import { validateConfigBody } from '@/features/ai/utilities/validation'
import { generateId } from '@skriuw/shared'

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() })

	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const result = await readMany(STORAGE_KEYS.AI_PROVIDER_CONFIG, {
		userId: session.user.id,
		isActive: true
	})

	if (!result.success || !result.data || result.data.length === 0) {
		return NextResponse.json(null)
	}

	const config = result.data[0]

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
	const session = await auth.api.getSession({ headers: await headers() })

	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const body = await request.json()
	const { provider, model, basePrompt, temperature = 70 } = body

	if (!provider || !model) {
		return NextResponse.json({ error: 'Provider and model are required' }, { status: 400 })
	}

	const now = Date.now()
	const db = getDatabase()

	// Check if config already exists
	const existingConfigs = await db
		.select()
		.from(aiProviderConfig)
		.where(eq(aiProviderConfig.userId, session.user.id))
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
			userId: session.user.id,
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
	const session = await auth.api.getSession({ headers: await headers() })

	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const body = await request.json()
	const updates: Record<string, unknown> = { updatedAt: Date.now() }

	if (body.provider !== undefined) updates.provider = body.provider
	if (body.model !== undefined) updates.model = body.model
	if (body.temperature !== undefined) updates.temperature = body.temperature
	if (body.basePrompt !== undefined) {
		updates.basePrompt = body.basePrompt ? encryptPrompt(body.basePrompt) : null
	}

	const db = getDatabase()
	const configs = await db
		.select()
		.from(aiProviderConfig)
		.where(eq(aiProviderConfig.userId, session.user.id))
		.limit(1)

	if (!configs[0]) {
		return NextResponse.json({ error: 'Config not found' }, { status: 404 })
	}

	await db.update(aiProviderConfig).set(updates).where(eq(aiProviderConfig.id, configs[0].id))

	const updatedConfig = { ...configs[0], ...body }

	return NextResponse.json({
		id: updatedConfig.id,
		provider: updatedConfig.provider,
		model: updatedConfig.model,
		basePrompt:
			body.basePrompt !== undefined
				? body.basePrompt
				: configs[0].basePrompt
					? decryptPrompt(configs[0].basePrompt)
					: null,
		temperature: updatedConfig.temperature,
		isActive: updatedConfig.isActive
	})
}
