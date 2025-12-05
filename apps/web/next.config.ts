import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
	// Enable React strict mode for better development experience
	reactStrictMode: true,

	// Transpile packages if needed
	transpilePackages: ['@skriuw/ui', '@skriuw/core-logic', '@skriuw/db'],

	// Configure external packages for server components
	serverExternalPackages: ['postgres'],

	// Fix for 431 Request Header Fields Too Large errors in development
	experimental: {},

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

	// Configure Turbopack (empty to silence warning)
	turbopack: {},

	// Configure webpack to handle large assets and optional Tauri modules
	webpack: (config, { isServer, webpack }) => {
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
