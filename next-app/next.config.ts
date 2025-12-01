import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['postgres', 'drizzle-orm']
  },
  env: {
    STORAGE_ADAPTER: 'database'
  },
  // This allows your existing shared imports to work
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src',
      '@shared': './shared',
      'ui': './src/shared/ui',
    }
    return config
  }
}

export default nextConfig