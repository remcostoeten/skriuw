
export type PromptChoice = {
    outcome: 'accepted' | 'dismissed'
    platform: string
}

export type PromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<PromptChoice>
}

export type StandaloneNav = Navigator & {
    standalone?: boolean
}

export const DISMISS_KEY = 'pwa-install-dismissed-at'
export const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
