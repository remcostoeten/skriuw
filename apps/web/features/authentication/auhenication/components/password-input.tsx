import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, Button } from '@skriuw/ui'
import { cn } from '@skriuw/shared'

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    className?: string
}

export function PasswordInput({
    className,
    value,
    onChange,
    ...props
}: PasswordInputProps) {
    const [showPassword, setShowPassword] = useState(false)

    return (
        <div className="relative">
            <Input
                type={showPassword ? "text" : "password"}
                className={cn("pr-10", className)}
                value={value}
                onChange={onChange}
                {...props}
            />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
            >
                {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground transition-all" />
                ) : (
                    <Eye className="h-4 w-4 text-muted-foreground transition-all" />
                )}
                <span className="sr-only">
                    {showPassword ? "Hide password" : "Show password"}
                </span>
            </Button>
        </div>
    )
}
