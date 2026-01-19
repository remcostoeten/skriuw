
/**
 * @fileoverview Welcome Tunnel Content
 * @description A "Live Tunnel" dashboard style welcome document.
 */

// Helper to create IDs
let idCounter = 0
const createId = (prefix: string) => `${prefix}-${Date.now()}-${++idCounter}`

// Block Creators
const heading = (level: 1 | 2 | 3, text: string) => ({
    id: createId('h'),
    type: 'heading' as const,
    props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: [{ type: 'text' as const, text, styles: {} }],
    children: [],
})

const paragraph = (text: string, styles: any = {}) => ({
    id: createId('p'),
    type: 'paragraph' as const,
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: text ? [{ type: 'text' as const, text, styles }] : [],
    children: [],
})

const codeBlock = (code: string, language = 'text') => ({
    id: createId('code'),
    type: 'codeBlock' as const,
    props: { language },
    content: [{ type: 'text' as const, text: code, styles: {} }],
    children: [],
})

const checkItem = (text: string, checked = false) => ({
    id: createId('chk'),
    type: 'checkListItem' as const,
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked },
    content: [{ type: 'text' as const, text, styles: {} }],
    children: [],
})

const callout = (text: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => ({
    id: createId('callout'),
    type: 'callout' as const, // Assuming custom block exists, otherwise fallback or remove
    props: { type },
    content: [{ type: 'text' as const, text, styles: {} }],
    children: [],
})


// The Content
export const getWelcomeTunnelContent = () => {
    const now = new Date();
    const time = (offsetSeconds: number = 0) => {
        const t = new Date(now.getTime() + offsetSeconds * 1000);
        return t.toLocaleTimeString('en-US', { hour12: false });
    };

    return [
        // Title
        heading(1, "🟢 Live Tunnel: Bedroom Node"),

        // Frontmatter via YAML Block
        codeBlock(
            `---
type: dashboard
status: active
latency: ${Math.floor(Math.random() * 20) + 5}ms
encryption: aes-256
location: Amsterdam / Bedroom-1
owner: remcostoeten
connected_devices: 4
---`, 'yaml'),

        paragraph(''),

        // Intro
        paragraph("Success. Secure uplink established. Welcome to your personal command center.", { bold: true }),
        paragraph("This interface is a live reflection of your digital environment, rendered directly from the neural core of the Skriuw editor."),

        paragraph(''),

        heading(2, "📡 System Status"),
        checkItem("Database Seeding: PURGED", true),
        checkItem("Zero-State Protocol: ACTIVE", true),
        checkItem("Frontend Aesthetics: PREMIUM", true),
        checkItem("Live Uplink: STABLE", true),

        paragraph(''),

        heading(2, "📝 Editor Capabilities"),
        paragraph("You are currently using the Skriuw v2 editor. It supports:"),

        // Feature list
        {
            id: createId('li'),
            type: 'bulletListItem',
            props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
            content: [{ type: 'text', text: 'Slash Commands (/ to activate)', styles: { code: true } }],
            children: []
        },
        {
            id: createId('li'),
            type: 'bulletListItem',
            props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
            content: [{ type: 'text', text: 'Markdown Shortcuts (try # or **)', styles: {} }],
            children: []
        },
        {
            id: createId('li'),
            type: 'bulletListItem',
            props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
            content: [{ type: 'text', text: 'Real-time Sync', styles: {} }],
            children: []
        },

        paragraph(''),

        heading(2, "🖥️ Live Logs"),
        codeBlock(
            `[${time(-4)}] INIT_SEQUENCE_START
[${time(-3)}] FLUSHING_OLD_SEEDS... DONE
[${time(-2)}] NETWORK_HANDSHAKE... ACK
[${time(-1)}] RENTERING_VIEWPORT... 100%
[${time(0)}] WAITING_FOR_USER_INPUT...`, 'bash'),

        paragraph(''),
        paragraph("End of stream."),
    ]
}
