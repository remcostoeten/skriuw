'use client'

import { AI_PROVIDERS, getDefaultModelForProvider, getModelsForProvider, type AIModel, type AIProvider } from "../types"
import { Label } from "@skriuw/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skriuw/ui/select"

type AIProviderSelectorProps = {
    provider: AIProvider
    model: AIModel
    onProviderChange: (provider: AIProvider) => void
    onModelChange: (model: AIModel) => void
    disabled?: boolean
}

export function AIProviderSelector({
    provider,
    model,
    onProviderChange,
    onModelChange,
    disabled
}: AIProviderSelectorProps) {
    function handleProviderChange(value: string) {
        const newProvider = value as AIProvider
        onProviderChange(newProvider)
        onModelChange(getDefaultModelForProvider(newProvider))
    }

    function handleModelChange(value: string) {
        onModelChange(value as AIModel)
    }

    const availableModels = getModelsForProvider(provider)

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="provider-select">AI Provider</Label>
                <Select value={provider} onValueChange={handleProviderChange} disabled={disabled}>
                    <SelectTrigger id="provider-select">
                        <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                        {AI_PROVIDERS.map((p) => (
                            <SelectItem key={p} value={p}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="model-select">Model</Label>
                <Select value={model} onValueChange={handleModelChange} disabled={disabled}>
                    <SelectTrigger id="model-select">
                        <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableModels.map((m) => (
                            <SelectItem key={m} value={m}>
                                {m}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
