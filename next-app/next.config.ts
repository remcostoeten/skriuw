import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	// Enable React strict mode for better development experience
	reactStrictMode: true,

	// Transpile packages if needed
	transpilePackages: [],

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

	// Configure webpack to handle large assets and optional Tauri modules
	webpack: (config, { isServer, webpack }) => {
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
