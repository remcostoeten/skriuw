import React from 'react'
import { Button, Label, Switch } from 'ui'
import { useEditorSetting } from '@/features/settings'
import { useUserPreferences } from '@/features/settings'

/**
 * Example component showing how to use the word wrap setting
 */
export function WordWrapExample() {
    const { value: wordWrap, setValue: setWordWrap } =
        useEditorSetting<boolean>('wordWrap')
    const { hasWordWrap } = useUserPreferences()

    return (
        <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Word Wrap Settings</h3>

            {/* Method 1: Using the dedicated useEditorSetting hook */}
            <div className="flex items-center space-x-2">
                <Switch
                    id="word-wrap-switch"
                    checked={wordWrap}
                    onCheckedChange={setWordWrap}
                />
                <Label htmlFor="word-wrap-switch">
                    Word Wrap (via useEditorSetting):{' '}
                    {wordWrap ? 'Enabled' : 'Disabled'}
                </Label>
            </div>

            {/* Method 2: Using the general useUserPreferences hook */}
            <div className="p-4 border rounded-md">
                <p className="text-sm text-muted-foreground mb-2">
                    Editor word wrap is currently:{' '}
                    <strong>{hasWordWrap ? 'ENABLED' : 'DISABLED'}</strong>
                </p>
                <p className="text-xs">
                    This affects how text flows in the BlockNote editor. When
                    enabled, long lines will wrap to fit the editor width.
                </p>
            </div>

            {/* Example of how this would apply to an editor */}
            <div className="p-4 border rounded-md bg-muted">
                <h4 className="font-medium mb-2">Preview Text:</h4>
                <div
                    style={{
                        whiteSpace: hasWordWrap ? 'pre-wrap' : 'pre',
                        wordWrap: hasWordWrap ? 'break-word' : 'normal',
                        overflowX: hasWordWrap ? 'hidden' : 'auto'
                    }}
                    className="font-mono text-sm p-2 bg-background border rounded"
                >
                    {`This is a very long line of text that will demonstrate the word wrapping functionality. When word wrap is enabled, this text should wrap to fit within the container width. When disabled, it should create a horizontal scrollbar and stay on one line.`}
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={() => setWordWrap(true)}
                    disabled={wordWrap}
                >
                    Enable Word Wrap
                </Button>
                <Button
                    variant="outline"
                    onClick={() => setWordWrap(false)}
                    disabled={!wordWrap}
                >
                    Disable Word Wrap
                </Button>
            </div>
        </div>
    )
}

/**
 * Example of how to conditionally render content based on user preferences
 */
export function ConditionalWordWrapExample() {
    const { hasWordWrap } = useUserPreferences()

    return (
        <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">
                Conditional Rendering Example
            </h3>

            {hasWordWrap ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-green-800">
                        ✅ Word wrap is enabled! Your text will wrap naturally.
                    </p>
                </div>
            ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-yellow-800">
                        ⚠️ Word wrap is disabled. Text will stay on single
                        lines.
                    </p>
                </div>
            )}

            <div className="text-sm text-muted-foreground">
                This shows how you can conditionally render UI based on user
                preferences.
            </div>
        </div>
    )
}
