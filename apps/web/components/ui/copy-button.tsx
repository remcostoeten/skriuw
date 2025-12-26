'use client'

import { useState } from 'react'
import { Button } from "@skriuw/ui"
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
    text: string
    label?: string
    className?: string
}

export function CopyButton({ text, label = "Copy", className }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className={className}
        >
            {copied ? (
                <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied!
                </>
            ) : (
                <>
                    <Copy className="h-4 w-4 mr-1" />
                    {label}
                </>
            )}
        </Button>
    )
}
