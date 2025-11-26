import React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
import { Slider } from '@/shared/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

import type { SettingsGroup, UserSetting } from '@/shared/data/types'

interface SettingsGroupProps {
    group: SettingsGroup
    values: Record<string, any>
    onChange: (key: string, value: any) => void
    disabled?: boolean
}

export function SettingsGroup({
    group,
    values,
    onChange,
    disabled = false
}: SettingsGroupProps) {
    const renderSetting = (setting: UserSetting) => {
        const currentValue = values[setting.key] ?? setting.defaultValue
        const handleChange = (value: any) => {
            onChange(setting.key, value)
        }

        // Disable setting if it's not implemented or explicitly disabled
        const isSettingDisabled = disabled || setting.implemented === false

        switch (setting.type) {
            case 'boolean':
                return (
                    <div key={setting.key} className="flex items-center justify-between space-y-0">
                        <div className="space-y-0.5 -2">
                            <Label>{setting.key}</Label>
                            <p className="text-sm text-balance text-muted-foreground">{setting.description}</p>
                        </div>
                        <Switch
                            checked={currentValue}
                            onCheckedChange={handleChange}
                            disabled={isSettingDisabled}
                        />
                    </div>
                )

            case 'enum':
                return (
                    <div key={setting.key} className="space-y-2">
                        <Label>{setting.key}</Label>
                        <p className="text-sm text-balance-muted-foreground">{setting.description}</p>

                        <Select
                            value={currentValue?.toString()}
                            onValueChange={handleChange}
                            disabled={isSettingDisabled}
                        >
                            <SelectTrigger>
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
                )

            case 'number':
                // Use slider for numeric settings that have reasonable ranges
                if (['fontSize', 'lineHeight', 'autoSaveInterval', 'tabSize'].includes(setting.key)) {
                    return (
                        <div key={setting.key} className="space-y-2">
                            <Label>{setting.key}</Label>
                            <p className="text-sm text-muted-foreground text-balance">{setting.description}</p>
                            <Slider
                                value={[currentValue]}
                                onValueChange={([value]) => handleChange(value)}
                                disabled={isSettingDisabled}
                                min={setting.key === 'fontSize' ? 12 : setting.key === 'tabSize' ? 1 : 0}
                                max={setting.key === 'fontSize' ? 24 : setting.key === 'tabSize' ? 8 : 100}
                                step={1}
                            />
                        </div>
                    )
                }
                // Fallthrough to string input for other numeric values
                return (
                    <div key={setting.key} className="space-y-2">
                        <Label>{setting.key}</Label>
                        <p className="text-sm  text-balance text-muted-foreground">{setting.description}</p>
                        <Input
                            type="number"
                            value={currentValue?.toString() || ''}
                            onChange={(e) => handleChange(Number(e.target.value))}
                            disabled={isSettingDisabled}
                        />
                    </div>
                )

            case 'string':
                return (
                    <div key={setting.key} className="space-y-2">
                        <Label>{setting.key}</Label>
                        <p className="text-sm text-muted-foreground text-balance">{setting.description}</p>
                        <Input
                            value={currentValue?.toString() || ''}
                            onChange={(e) => handleChange(e.target.value)}
                            disabled={isSettingDisabled}
                        />
                    </div>
                )

            default:
                return (
                    <div key={setting.key} className="text-sm text-muted-foreground">
                        Unsupported setting type: {setting.type}
                    </div>
                )
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
                <p className="text-sm text-muted-foreground text-balance">{group.description}</p>
            </CardHeader>
            <CardContent className="space-y-6">
                {group.settings
                    .filter(setting => setting.implemented !== false)
                    .map(renderSetting)}
            </CardContent>
        </Card>
    )
}
