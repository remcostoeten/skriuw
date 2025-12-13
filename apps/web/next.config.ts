import type { NextConfig } from 'next'
import path from 'path'

const isTauriBuild = process.env.TAURI_BUILD === 'true'

const nextConfig: NextConfig = {
        // Enable React strict mode for better development experience
        reactStrictMode: true,

	// Transpile packages if needed
	transpilePackages: ['@skriuw/ui', '@skriuw/core-logic', '@skriuw/db'],

	// Configure external packages for server components
	serverExternalPackages: ['postgres'],

	// Fix for 431 Request Header Fields Too Large errors in development
	experimental: {
		// Optimize production builds
		optimizePackageImports: ['@blocknote/mantine', '@blocknote/xl-ai'],
	},

	// Disable source maps in production to reduce bundle size
	productionBrowserSourceMaps: false,

        // Optimize for Docker and Vercel deployments by only including necessary files
        output: isTauriBuild ? 'export' : 'standalone',

        images: {
                unoptimized: isTauriBuild,
        },

	// Configure headers to handle large headers in development
	headers: async () => {
		return [
			{
				source: '/_next/static/:path*',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=31536000, immutable',
					},
				],
			},
		]
	},

	// Configure Turbopack to use explicit root directory
	turbopack: {
		root: path.resolve('../..'),
	},

	// Configure webpack to handle large assets and optional Tauri modules
	webpack: (config, { isServer, webpack }) => {
		// Remove source maps in production to reduce bundle size
		if (config.mode === 'production') {
			config.devtool = false
		}

		// Fix path resolution for @/* alias and @skriuw/storage
		const projectRoot = path.resolve('.')
		config.resolve.alias = {
			...config.resolve.alias,
			'@': projectRoot,
			'@skriuw/storage': path.resolve('./lib/storage'),
			'@skriuw/storage/crud': path.resolve('./lib/storage/crud'),
		}

		if (!isServer) {
			config.resolve.fallback = {
				...config.resolve.fallback,
				fs: false,
			}
		}

		// Ignore optional Tauri modules that are only available in desktop environments
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^@tauri-apps\/api\/(window|event)$/,
			})
		)

		return config
	},
}

export default nextConfig
