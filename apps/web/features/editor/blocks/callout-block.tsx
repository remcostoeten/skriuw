import { createReactBlockSpec } from '@blocknote/react'
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'

const calloutTypes = {
    info: {
        icon: Info,
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
        textColor: 'text-blue-600 dark:text-blue-400',
        label: 'Info',
    },
    warning: {
        icon: AlertTriangle,
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
        textColor: 'text-amber-600 dark:text-amber-400',
        label: 'Warning',
    },
    error: {
        icon: AlertCircle,
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/20',
        textColor: 'text-red-600 dark:text-red-400',
        label: 'Error',
    },
    success: {
        icon: CheckCircle,
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        label: 'Success',
    },
} as const

type CalloutType = keyof typeof calloutTypes

export const calloutBlockSpec: any = createReactBlockSpec(
    {
        type: 'callout',
        propSchema: {
            type: {
                default: 'info',
                values: ['info', 'warning', 'error', 'success'],
            },
        },
        content: 'inline',
    },
    {
        render: ({ block, editor, contentRef }) => {
            const type = (block.props.type as CalloutType) || 'info'
            const config = calloutTypes[type]
            const Icon = config.icon

            return (
                <div
                    className={`flex gap-3 my-4 p-4 rounded-lg border ${config.bgColor} ${config.borderColor}`}
                    role="alert"
                >
                    <div
                        className={`flex-shrink-0 mt-0.5 select-none cursor-pointer ${config.textColor}`}
                        contentEditable={false}
                        onClick={() => {
                            // Cycle through types on icon click
                            const types = Object.keys(calloutTypes) as CalloutType[]
                            const currentIndex = types.indexOf(type)
                            const nextType = types[(currentIndex + 1) % types.length]
                            editor.updateBlock(block.id, {
                                props: { type: nextType }
                            })
                        }}
                        title="Click to toggle type"
                    >
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 pointer-events-auto" ref={contentRef} />
                </div>
            )
        },
    }
)
