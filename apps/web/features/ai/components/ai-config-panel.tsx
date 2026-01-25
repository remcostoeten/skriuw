'use client'

import { useState, useEffect } from "react"
import { useAIConfig, useAIUsage, useSaveAIConfig, useUpdateAIConfig } from "../hooks"
import { getDefaultModelForProvider, DAILY_PROMPT_LIMIT, type AIModel, type AIProvider } from "../types"
import { formatTimeUntilReset } from "../utilities"
import { AIProviderSelector } from "./ai-provider-selector"
import { AITestPanel } from "./ai-test-panel"
import { Button } from "@skriuw/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@skriuw/ui/card"
import { Label } from "@skriuw/ui/label"
import { Slider } from "@skriuw/ui/slider"
import { Textarea } from "@skriuw/ui/textarea"
import { Badge } from "@skriuw/ui/badge"
import { Bot, Loader2, Save } from "lucide-react"

export function AIConfigPanel() {
    const { data: config, isLoading: configLoading } = useAIConfig()
    const { data: usage } = useAIUsage()
    const { mutate: saveConfig, isPending: saving } = useSaveAIConfig()
    const { mutate: updateConfig, isPending: updating } = useUpdateAIConfig()

    const [provider, setProvider] = useState<AIProvider>('gemini')
    const [model, setModel] = useState<AIModel>('gemini-3-flash')
    const [basePrompt, setBasePrompt] = useState('')
    const [temperature, setTemperature] = useState(70)
    const [hasChanges, setHasChanges] = useState(false)

    useEffect(() => {
        if (config) {
            setProvider(config.provider as AIProvider)
            setModel(config.model as AIModel)
            setBasePrompt(config.basePrompt || '')
            setTemperature(config.temperature)
            setHasChanges(false)
        }
    }, [config])

    function handleProviderChange(newProvider: AIProvider) {
        setProvider(newProvider)
        setModel(getDefaultModelForProvider(newProvider))
        setHasChanges(true)
    }

    function handleModelChange(newModel: AIModel) {
        setModel(newModel)
        setHasChanges(true)
    }

    function handleBasePromptChange(value: string) {
        setBasePrompt(value)
        setHasChanges(true)
    }

    function handleTemperatureChange(value: number[]) {
        setTemperature(value[0])
        setHasChanges(true)
    }

    function handleSave() {
        if (config) {
            updateConfig({
                provider,
                model,
                basePrompt: basePrompt || null,
                temperature
            })
        } else {
            saveConfig({
                provider,
                model,
                basePrompt: basePrompt || undefined,
                temperature
            })
        }
        setHasChanges(false)
    }

    if (configLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        AI Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Bot className="h-5 w-5" />
                                AI Configuration
                            </CardTitle>
                            <CardDescription>
                                Configure your AI provider and model preferences.
                            </CardDescription>
                        </div>
                        {usage && (
                            <Badge variant="outline" className="ml-auto">
                                {usage.promptsRemaining}/{DAILY_PROMPT_LIMIT} prompts
                                {usage.promptsRemaining < DAILY_PROMPT_LIMIT && (
                                    <span className="ml-1 text-muted-foreground">
                                        (resets in {formatTimeUntilReset(usage.resetAt)})
                                    </span>
                                )}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <AIProviderSelector
                        provider={provider}
                        model={model}
                        onProviderChange={handleProviderChange}
                        onModelChange={handleModelChange}
                        disabled={saving || updating}
                    />

                    <div className="space-y-2">
                        <Label htmlFor="temperature">
                            Temperature: {(temperature / 100).toFixed(2)}
                        </Label>
                        <Slider
                            id="temperature"
                            min={0}
                            max={100}
                            step={1}
                            value={[temperature]}
                            onValueChange={handleTemperatureChange}
                            disabled={saving || updating}
                        />
                        <p className="text-xs text-muted-foreground">
                            Lower values produce more focused outputs, higher values increase creativity.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="base-prompt">Base Prompt (Optional)</Label>
                        <Textarea
                            id="base-prompt"
                            placeholder="Enter a system prompt that will be prepended to all your requests..."
                            value={basePrompt}
                            onChange={(e) => handleBasePromptChange(e.target.value)}
                            rows={4}
                            disabled={saving || updating}
                        />
                        <p className="text-xs text-muted-foreground">
                            This prompt sets context and behavior for the AI.
                        </p>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || saving || updating}
                        className="w-full sm:w-auto"
                    >
                        {saving || updating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Configuration
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <AITestPanel />
        </div>
    )
}
