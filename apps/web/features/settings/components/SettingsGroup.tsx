'use client'

import React, { Suspense } from 'react'

import { Label } from '@skriuw/ui/label'
import { Input } from '@skriuw/ui/input'
import { Switch } from '@skriuw/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@skriuw/ui/select'

import type { SettingsGroup, UserSetting } from '../types'
import { getPreviewRenderer } from '../preview-renderers'

type props = {
	group: SettingsGroup
	values: Record<string, any>
	onChange: (key: string, value: any) => void
	disabled?: boolean
}

function SettingPreview({
	componentKey,
	value,
	settingKey,
	options,
	allSettings
}: {
	componentKey: string
	value: any
	settingKey: string
	options?: any[]
	allSettings?: Record<string, any>
}) {
	const PreviewComponent = getPreviewRenderer(componentKey)

	if (!PreviewComponent) return null

	return (
		<Suspense fallback={
			<div className="mt-3 rounded-md border border-border bg-muted/30 h-20 flex items-center justify-center">
				<span className="text-xs text-muted-foreground">Loading preview...</span>
			</div>
		}>
			<PreviewComponent
				value={value}
				settingKey={settingKey}
				options={options}
				allSettings={allSettings}
			/>
		</Suspense>
	)
}

export function SettingsGroup({ group, values, onChange, disabled = false }: props) {
	const renderSetting = (setting: UserSetting, isLast: boolean) => {
		const currentValue = values[setting.key] ?? setting.defaultValue

		if (setting.condition && !setting.condition(values)) {
			return null
		}

		function handleChange(value: any) {
			onChange(setting.key, value)
		}

		const isSettingDisabled = disabled || setting.implemented === false || setting.disabled === true

		function renderPreview() {
			if (!setting.preview) return null

			return (
				<SettingPreview
					componentKey={setting.preview.component}
					value={currentValue}
					settingKey={setting.key}
					options={setting.options}
					allSettings={values}
					{...setting.preview.props}
				/>
			)
		}

		switch (setting.type) {
			case 'boolean':
				return (
					<div
						key={setting.key}
						className={`py-4 overflow-visible ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 pr-8">
								<Label className="text-base font-medium text-foreground block">{setting.label || setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
									{setting.description}
								</p>
								{setting.disabledReason && (
									<p className="text-xs text-muted-foreground mt-1">{setting.disabledReason}</p>
								)}
							</div>
							<Switch
								checked={currentValue}
								onCheckedChange={handleChange}
								disabled={isSettingDisabled}
								size="md"
							/>
						</div>
						{renderPreview()}
					</div>
				)

			case 'enum':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 pr-8">
								<Label className="text-base font-medium text-foreground block">{setting.label || setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
									{setting.description}
								</p>
								{setting.disabledReason && (
									<p className="text-xs text-muted-foreground mt-1">{setting.disabledReason}</p>
								)}
							</div>
							<Select
								value={currentValue?.toString()}
								onValueChange={handleChange}
								disabled={isSettingDisabled}
							>
								<SelectTrigger className="w-[160px] shrink-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{setting.options?.map((option) => (
										<SelectItem key={option} value={option.toString()}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{renderPreview()}
					</div>
				)

			case 'number':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 pr-8">
								<Label className="text-base font-medium text-foreground block">{setting.label || setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
									{setting.description}
								</p>
								{setting.disabledReason && (
									<p className="text-xs text-muted-foreground mt-1">{setting.disabledReason}</p>
								)}
							</div>
							<Input
								type="number"
								value={currentValue?.toString() || ''}
								onChange={(e) => handleChange(Number(e.target.value))}
								disabled={isSettingDisabled}
								className="w-[100px] shrink-0"
							/>
						</div>
						{renderPreview()}
					</div>
				)

			case 'string':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 pr-8">
								<Label className="text-base font-medium text-foreground block">{setting.label || setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
									{setting.description}
								</p>
								{setting.disabledReason && (
									<p className="text-xs text-muted-foreground mt-1">{setting.disabledReason}</p>
								)}
							</div>
							<Input
								value={currentValue?.toString() || ''}
								onChange={(e) => handleChange(e.target.value)}
								disabled={isSettingDisabled}
								className="w-[180px] shrink-0"
							/>
						</div>
						{renderPreview()}
					</div>
				)

			default:
				return (
					<div key={setting.key} className="text-sm text-muted-foreground py-4">
						Unsupported setting type: {setting.type}
					</div>
				)
		}
	}

	const implementedSettings = group.settings.filter((setting) => setting.implemented !== false)
	const disabledNotice =
		group.category === 'ai'
			? 'AI settings are coming soon and are currently disabled.'
			: undefined

	return (
		<div className="w-full max-w-2xl">
			<div className="pb-4 mb-2 border-b border-border">
				<h2 className="text-xl font-semibold text-foreground">{group.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{group.description}</p>
				{disabledNotice && (
					<p className="text-xs text-muted-foreground mt-1 bg-muted/40 inline-block px-2 py-1 rounded border border-dashed border-border">
						{disabledNotice}
					</p>
				)}
			</div>
			<div>
				{implementedSettings.map((setting, index) => {
					const isLast = index === implementedSettings.length - 1
					const showSubsectionHeader = setting.subsection && (
						index === 0 || implementedSettings[index - 1].subsection !== setting.subsection
					)

					return (
						<React.Fragment key={setting.key}>
							{showSubsectionHeader && (
								<div className="mt-6 mb-2 first:mt-0">
									<h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
										{setting.subsection}
									</h3>
								</div>
							)}
							{renderSetting(setting, isLast)}
						</React.Fragment>
					)
				})}
			</div>
		</div>
	)
}
