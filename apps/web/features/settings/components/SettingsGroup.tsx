import React from 'react'

import { Label } from '@skriuw/ui/label'
import { Input } from '@skriuw/ui/input'
import { Switch } from '@skriuw/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@skriuw/ui/select'

import type { SettingsGroup, UserSetting } from '../types'

interface SettingsGroupProps {
	group: SettingsGroup
	values: Record<string, any>
	onChange: (key: string, value: any) => void
	disabled?: boolean
}

export function SettingsGroup({ group, values, onChange, disabled = false }: SettingsGroupProps) {
	const renderSetting = (setting: UserSetting, isLast: boolean) => {
		const currentValue = values[setting.key] ?? setting.defaultValue
		const handleChange = (value: any) => {
			onChange(setting.key, value)
		}

		// Disable setting if it's not implemented or explicitly disabled
		const isSettingDisabled = disabled || setting.implemented === false

		switch (setting.type) {
			case 'boolean':
				return (
					<div
						key={setting.key}
						className={`flex items-center justify-between py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="space-y-1 pr-4">
							<Label className="text-sm font-medium text-foreground">{setting.key}</Label>
							<p className="text-sm text-muted-foreground leading-relaxed">
								{setting.description}
							</p>
						</div>
						<Switch
							checked={currentValue}
							onCheckedChange={handleChange}
							disabled={isSettingDisabled}
							size="md"
						/>
					</div>
				)

			case 'enum':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="space-y-1 pr-4">
								<Label className="text-sm font-medium text-foreground">{setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{setting.description}
								</p>
							</div>
							<Select
								value={currentValue?.toString()}
								onValueChange={handleChange}
								disabled={isSettingDisabled}
							>
								<SelectTrigger className="w-[180px]">
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
					</div>
				)

			case 'number':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="space-y-1 pr-4">
								<Label className="text-sm font-medium text-foreground">{setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{setting.description}
								</p>
							</div>
							<Input
								type="number"
								value={currentValue?.toString() || ''}
								onChange={(e) => handleChange(Number(e.target.value))}
								disabled={isSettingDisabled}
								className="w-[120px]"
							/>
						</div>
					</div>
				)

			case 'string':
				return (
					<div
						key={setting.key}
						className={`py-4 ${!isLast ? 'border-b border-border/50' : ''}`}
					>
						<div className="flex items-center justify-between">
							<div className="space-y-1 pr-4">
								<Label className="text-sm font-medium text-foreground">{setting.key}</Label>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{setting.description}
								</p>
							</div>
							<Input
								value={currentValue?.toString() || ''}
								onChange={(e) => handleChange(e.target.value)}
								disabled={isSettingDisabled}
								className="w-[200px]"
							/>
						</div>
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

	return (
		<div className="space-y-0">
			<div className="pb-4 mb-2 border-b border-border">
				<h2 className="text-xl font-semibold text-foreground">{group.title}</h2>
				<p className="text-sm text-muted-foreground mt-1">{group.description}</p>
			</div>
			<div>
				{implementedSettings.map((setting, index) =>
					renderSetting(setting, index === implementedSettings.length - 1)
				)}
			</div>
		</div>
	)
}
