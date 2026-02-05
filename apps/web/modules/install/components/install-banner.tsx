
import { cn } from "@skriuw/shared";
import { Button } from "@skriuw/ui/button";
import { Download, X } from "lucide-react";

type Props = {
    platform: 'ios' | 'android' | 'desktop'
    onInstall: () => void
    onDismiss: () => void
}

export function InstallBanner({ platform, onInstall, onDismiss }: Props) {
    return (
        <div
            className={cn(
                'fixed z-[80] transition-all duration-300 ease-out',
                'bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_12px)] left-3 right-3',
                'sm:left-auto sm:right-4 sm:bottom-20 sm:w-auto sm:max-w-[320px]'
            )}
        >
            <div
                className={cn(
                    'flex items-center gap-3',
                    'bg-[#1a1a1a] border border-white/[0.08]',
                    'p-3 rounded-2xl',
                    'shadow-[0_8px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]',
                    'animate-in fade-in slide-in-from-bottom-4 duration-300'
                )}
            >
                <div
                    className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center',
                        'rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10',
                        'ring-1 ring-emerald-500/30'
                    )}
                >
                    <Download className='h-5 w-5 text-emerald-400' />
                </div>

                <div className='flex-1 min-w-0 pr-1'>
                    <p className='text-[13px] font-semibold text-white leading-tight'>
                        Install Skriuw
                    </p>
                    <p className='text-[11px] text-white/50 leading-tight mt-0.5 truncate'>
                        Better experience as an app
                    </p>
                </div>

                <div className='flex items-center gap-1.5 shrink-0'>
                    <Button
                        size='sm'
                        onClick={onInstall}
                        className={cn(
                            'h-9 px-4 text-xs font-semibold',
                            'bg-white text-black hover:bg-white/90',
                            'rounded-xl shadow-sm'
                        )}
                    >
                        {platform === 'ios' ? 'How to' : 'Install'}
                    </Button>
                    <button
                        type='button'
                        onClick={onDismiss}
                        className={cn(
                            'flex items-center justify-center',
                            'h-9 w-9 rounded-xl',
                            'text-white/40 hover:text-white/70 hover:bg-white/5',
                            'transition-colors duration-150'
                        )}
                        aria-label='Dismiss'
                    >
                        <X className='h-4 w-4' />
                    </button>
                </div>
            </div>
        </div>
    )
}
