// apps/web/features/settings/components/AiSettingsTab.tsx
// AI Settings tab for Skriuw Settings dialog.
// Uses existing SettingsGroup component for consistent styling.

import React from 'react'
import { SettingsGroup } from './SettingsGroup'
import { AI_SETTINGS_GROUPS } from '../ai-settings'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const AiSettingsValidation = z.object({
	enabled: z.boolean(),
	provider: z.string(),
	model: z.string(),
	userKey: z.string().optional(),
	spellcheck: z.boolean(),
})

type FormValues = z.infer<typeof AiSettingsValidation>

export const AiSettingsTab: React.FC = () => {
	// TODO: Implement useSettings hook
	// const { settings, updateSetting } = useSettings();
	const mockSettings = {
		'ai.enabled': false,
		'ai.provider': 'gemini',
		'ai.model': 'gemini-2.0-flash-exp',
		'ai.user_key': '',
		'ai.features.spellcheck': true,
	}

	const updateSetting = (key: string, value: any) => {
		console.log('Update setting:', key, value)
		// TODO: Implement actual settings update
	}

	const defaultValues: FormValues = {
		enabled: mockSettings['ai.enabled'] ?? false,
		provider: mockSettings['ai.provider'] ?? 'gemini',
		model: mockSettings['ai.model'] ?? 'gemini-2.0-flash-exp',
		userKey: mockSettings['ai.user_key'] ?? '',
		spellcheck: mockSettings['ai.features.spellcheck'] ?? true,
	}

	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<FormValues>({
		resolver: zodResolver(AiSettingsValidation),
		defaultValues,
	})

	const onSubmit = (data: FormValues) => {
		// Persist each setting individually – Settings system expects key/value pairs.
		updateSetting('ai.enabled', data.enabled)
		updateSetting('ai.provider', data.provider)
		updateSetting('ai.model', data.model)
		updateSetting('ai.user_key', data.userKey)
		updateSetting('ai.features.spellcheck', data.spellcheck)
	}

	return (
		<div>
			{AI_SETTINGS_GROUPS.map((group) => (
				<SettingsGroup
					key={group.category}
					group={group}
					values={mockSettings}
					onChange={updateSetting}
				/>
			))}
			<form onSubmit={handleSubmit(onSubmit)}>
				<div className="mt-4 flex justify-end">
					<button
						type="submit"
						className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Save AI Settings
					</button>
				</div>
			</form>
		</div>
	)
}
