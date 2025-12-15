import React from 'react'
import { Input } from '@skriuw/ui'

interface EmailAutocompleteProps {
    id?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
}

export default function EmailAutocomplete({
    id,
    value,
    onChange,
    placeholder,
    className
}: EmailAutocompleteProps) {
    return (
        <Input
            id={id}
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={className}
            autoComplete="email"
        />
    )
}
