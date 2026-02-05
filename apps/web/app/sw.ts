import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

/// <reference lib="webworker" />

declare global {
	// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging requires interface
	interface WorkerGlobalScope extends SerwistGlobalConfig {
		__SW_MANIFEST: (PrecacheEntry | string)[] | undefined
	}
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
	precacheEntries: self.__SW_MANIFEST,
	skipWaiting: true,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: defaultCache,
	fallbacks: {
		entries: [
			{
				url: '/offline',
				matcher({ request }) {
					return request.destination === 'document'
				}
			}
		]
	}
})

serwist.addEventListeners()
