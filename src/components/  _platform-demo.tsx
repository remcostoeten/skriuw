'use client'

import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'utils';

interface FileContent {
    text: string;
    timestamp: string;
    platform: string;
}

export default function ExampleComponent() {
    const [mounted, setMounted] = useState(false)
    const [fileContent, setFileContent] = useState<FileContent | null>(null)
    const [lastAction, setLastAction] = useState<string>('')

    useEffect(() => {
        setMounted(true)
        // Initialize with some sample content
        setFileContent({
            text: `# Welcome to InstantDB Notes

This is a sample note created with the platform demo.

## Features
- **File Operations**: Open and save files
- **Platform Detection**: Works on desktop and web
- **Keyboard Shortcuts**: Use 'Cmd+S' or 'Ctrl+S' to save
- **Auto-save**: Content is automatically saved when you type

Start typing below to see auto-save in action!`,
            timestamp: new Date().toISOString(),
            platform: Platform.platformTag()
        })
    }, [])

    if (!mounted) return null

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">Platform Detection Demo</h1>
                <p className="text-gray-600">A comprehensive demo showing Tauri and browser capabilities</p>
            </div>

            {Platform.isTauri() ? <DesktopFeatures fileContent={fileContent} setFileContent={setFileContent} setLastAction={setLastAction} /> : <WebFeatures setLastAction={setLastAction} />}

            <KeyboardShortcuts fileContent={fileContent} setLastAction={setLastAction} />

            <PlatformInfo />

            <FileEditor
                fileContent={fileContent}
                setFileContent={setFileContent}
                setLastAction={setLastAction}
                isDesktop={Platform.isTauri()}
            />

            <LastActionDisplay lastAction={lastAction} />
        </div>
    )
}

function DesktopFeatures({
    fileContent,
    setFileContent,
    setLastAction
}: {
    fileContent: FileContent | null
    setFileContent: (content: FileContent | null) => void
    setLastAction: (action: string) => void
}) {
    const handleOpenFile = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog')
            const { readTextFile } = await import('@tauri-apps/plugin-fs')

            const selected = await open({
                multiple: false,
                directory: false,
                filters: [
                    {
                        name: 'Text Files',
                        extensions: ['txt', 'md', 'json']
                    },
                    {
                        name: 'All Files',
                        extensions: ['*']
                    }
                ]
            })

            if (selected && typeof selected === 'string') {
                const content = await readTextFile(selected)
                setFileContent({
                    text: content,
                    timestamp: new Date().toISOString(),
                    platform: Platform.platformTag()
                })
                setLastAction(`✅ Opened file: ${selected}`)
            }
        } catch (error) {
            setLastAction(`❌ Error opening file: ${error}`)
        }
    }

    const handleSaveFile = async () => {
        if (!fileContent) {
            setLastAction('⚠️ No content to save')
            return
        }

        try {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const { writeTextFile } = await import('@tauri-apps/plugin-fs')

            const path = await save({
                defaultPath: `notes-${Date.now()}.md`,
                filters: [
                    {
                        name: 'Markdown',
                        extensions: ['md']
                    },
                    {
                        name: 'Text Files',
                        extensions: ['txt']
                    },
                    {
                        name: 'JSON',
                        extensions: ['json']
                    }
                ]
            })

            if (path) {
                // Add metadata to the file
                const contentWithMetadata = `${fileContent.text}\n\n---\n*Saved on ${new Date().toLocaleString()} from ${fileContent.platform}*`
                await writeTextFile(path, contentWithMetadata)
                setLastAction(`✅ Saved to: ${path}`)
            }
        } catch (error) {
            setLastAction(`❌ Error saving file: ${error}`)
        }
    }

    const handleSaveAsJSON = async () => {
        if (!fileContent) {
            setLastAction('⚠️ No content to save')
            return
        }

        try {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const { writeTextFile } = await import('@tauri-apps/plugin-fs')

            const path = await save({
                defaultPath: `notes-${Date.now()}.json`,
                filters: [
                    {
                        name: 'JSON Files',
                        extensions: ['json']
                    }
                ]
            })

            if (path) {
                const jsonData = JSON.stringify({
                    ...fileContent,
                    savedAt: new Date().toISOString(),
                    appInfo: {
                        name: 'InstantDB Notes',
                        version: '0.1.0',
                        platform: Platform.platformTag()
                    }
                }, null, 2)

                await writeTextFile(path, jsonData)
                setLastAction(`✅ Saved JSON to: ${path}`)
            }
        } catch (error) {
            setLastAction(`❌ Error saving JSON: ${error}`)
        }
    }

    return (
        <div className="bg-blue-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-blue-900">🖥️ Desktop Mode (Tauri)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    onClick={handleOpenFile}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                >
                    📂 Open File
                </button>
                <button
                    onClick={handleSaveFile}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                >
                    💾 Save as Markdown
                </button>
                <button
                    onClick={handleSaveAsJSON}
                    className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
                >
                    📄 Save as JSON
                </button>
            </div>
            <p className="mt-4 text-sm text-blue-700">
                Full file system access with open/save dialogs. Files are saved with metadata and timestamps.
            </p>
        </div>
    )
}

function WebFeatures({ setLastAction }: { setLastAction: (action: string) => void }) {
    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const content = event.target?.result as string
                let message = `📁 Uploaded: ${file.name} (${file.size} bytes)`

                // You could parse the content here
                if (content.length < 100000) { // Only show preview for smaller files
                    message += `\n📝 Preview: ${content.substring(0, 100)}...`
                }
                setLastAction(message)
            }
            reader.readAsText(file)
        }
    }

    const handleDownload = () => {
        const content = `# Sample Note\n\nThis is a downloadable note from the web version.\n\nCreated: ${new Date().toLocaleString()}\nPlatform: ${Platform.platformTag()}`
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `note-${Date.now()}.md`
        a.click()
        URL.revokeObjectURL(url)
        setLastAction('⬇️ Downloaded sample note as markdown')
    }

    return (
        <div className="bg-green-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-green-900">🌐 Web Mode (Browser)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block">
                        <span className="sr-only">Choose file</span>
                        <input
                            type="file"
                            onChange={handleUpload}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                        />
                    </label>
                </div>
                <button
                    onClick={handleDownload}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                >
                    ⬇️ Download Sample
                </button>
            </div>
            <p className="mt-4 text-sm text-green-700">
                Limited to browser APIs. Files can be uploaded for reading and downloaded for saving.
            </p>
        </div>
    )
}

function KeyboardShortcuts({
    fileContent,
    setLastAction
}: {
    fileContent: FileContent | null
    setLastAction: (action: string) => void
}) {
    const handleSave = useCallback(async () => {
        if (!Platform.isTauri() || !fileContent) {
            setLastAction('⚠️ Save shortcut only works in desktop mode with content')
            return
        }

        try {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const { writeTextFile } = await import('@tauri-apps/plugin-fs')

            const path = await save({
                defaultPath: `quick-save-${Date.now()}.md`,
            })

            if (path) {
                await writeTextFile(path, fileContent.text)
                setLastAction(`⚡ Quick-saved: ${path}`)
            }
        } catch (error) {
            setLastAction(`❌ Quick-save failed: ${error}`)
        }
    }, [fileContent, setLastAction])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const modKey = Platform.primaryModEventKey()

            if (e[modKey] && e.key === 's') {
                e.preventDefault()
                handleSave()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSave])

    return (
        <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-yellow-900">⌨️ Keyboard Shortcuts</h3>
            <div className="flex items-center space-x-4">
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-sm">
                    {Platform.primaryModKey()} + S
                </kbd>
                <span className="text-sm text-yellow-700">Quick save (desktop only)</span>
            </div>
        </div>
    )
}

function PlatformInfo() {
    return (
        <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">🖥️ Platform Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white rounded border">
                    <div className="text-2xl mb-1">{Platform.runtime() === 'tauri' ? '🦀' : Platform.runtime() === 'browser' ? '🌐' : '💻'}</div>
                    <div className="text-xs text-gray-600">Runtime</div>
                    <div className="font-mono text-sm">{Platform.runtime()}</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                    <div className="text-2xl mb-1">{Platform.isMac() ? '🍎' : Platform.isWindows() ? '🪟' : Platform.isLinux() ? '🐧' : '❓'}</div>
                    <div className="text-xs text-gray-600">OS</div>
                    <div className="font-mono text-sm">{Platform.os()}</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                    <div className="text-2xl mb-1">🏷️</div>
                    <div className="text-xs text-gray-600">Platform Tag</div>
                    <div className="font-mono text-sm">{Platform.platformTag()}</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                    <div className="text-2xl mb-1">{Platform.isMobile() ? '📱' : '🖥️'}</div>
                    <div className="text-xs text-gray-600">Device Type</div>
                    <div className="font-mono text-sm">{Platform.isMobile() ? 'Mobile' : 'Desktop'}</div>
                </div>
            </div>
            {Platform.arch() && (
                <div className="mt-4 text-sm text-gray-600">
                    Architecture: <span className="font-mono">{Platform.arch()}</span>
                </div>
            )}
        </div>
    )
}

function FileEditor({
    fileContent,
    setFileContent,
    setLastAction,
    isDesktop
}: {
    fileContent: FileContent | null
    setFileContent: (content: FileContent | null) => void
    setLastAction: (action: string) => void
    isDesktop: boolean
}) {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value
        setFileContent(prev => prev ? {
            ...prev,
            text: newText,
            timestamp: new Date().toISOString()
        } : {
            text: newText,
            timestamp: new Date().toISOString(),
            platform: Platform.platformTag()
        })

        setLastAction('✏️ Auto-saving...')

        // Clear the auto-save message after 2 seconds
        setTimeout(() => {
            setLastAction('')
        }, 2000)
    }

    return (
        <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">📝 Note Editor</h3>
            <textarea
                value={fileContent?.text || ''}
                onChange={handleChange}
                placeholder="Start typing your note here..."
                className="w-full h-64 p-4 border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>
                    {fileContent?.text.length || 0} characters
                </span>
                <span>
                    Last updated: {fileContent ? new Date(fileContent.timestamp).toLocaleTimeString() : 'Never'}
                </span>
            </div>
            {isDesktop && (
                <p className="mt-2 text-xs text-gray-600">
                    💡 Auto-save enabled. Use {Platform.primaryModKey()}+S for quick save.
                </p>
            )}
        </div>
    )
}

function LastActionDisplay({ lastAction }: { lastAction: string }) {
    if (!lastAction) return null

    return (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg max-w-sm animate-pulse">
            <div className="text-sm">{lastAction}</div>
        </div>
    )
}
