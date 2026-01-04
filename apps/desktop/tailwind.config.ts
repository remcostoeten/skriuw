import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                background: {
                    light: '#ffffff',
                    dark: '#0a0a0a',
                },
                foreground: {
                    light: '#171717',
                    dark: '#ededed',
                },
            },
        },
    },
    plugins: [],
}
export default config
