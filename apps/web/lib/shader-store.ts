'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ShaderPreset = 'default' | 'slow' | 'fast' | 'chaotic' | 'calm'

interface ShaderConfig {
	speed: number
	blur: number
	scale: number
	dpr: [number, number]
	preset: ShaderPreset
	position: { x: number; y: number; z: number }
}

interface ShaderStore extends ShaderConfig {
	setConfig: (config: Partial<ShaderConfig>) => void
	setPreset: (preset: ShaderPreset) => void
	reset: () => void
}

const presets: Record<ShaderPreset, Partial<ShaderConfig>> = {
	default: {
		speed: 1,
		blur: 0,
		scale: 1.1,
		dpr: [1, 2],
		position: { x: 0, y: -0.75, z: -0.5 }
	},
	slow: {
		speed: 0.25,
		blur: 5,
		scale: 1.15,
		dpr: [1, 1.5],
		position: { x: 0, y: -0.75, z: -0.5 }
	},
	fast: {
		speed: 2.5,
		blur: 0,
		scale: 1,
		dpr: [1, 2],
		position: { x: 0, y: -0.75, z: -0.5 }
	},
	chaotic: {
		speed: 5,
		blur: 0,
		scale: 1.2,
		dpr: [1, 2],
		position: { x: 0.5, y: -0.75, z: -0.5 }
	},
	calm: {
		speed: 0.5,
		blur: 10,
		scale: 1.05,
		dpr: [1, 1],
		position: { x: 0, y: -0.8, z: -0.6 }
	}
}

export const useShaderStore = create<ShaderStore>()(
	persist(
		(set) => ({
			speed: presets.default.speed!,
			blur: presets.default.blur!,
			scale: presets.default.scale!,
			dpr: presets.default.dpr!,
			position: presets.default.position!,
			preset: 'default',
			setConfig: (config) =>
				set((state) => ({ ...state, ...config, preset: 'default' })),
			setPreset: (preset) =>
				set((state) => ({ ...state, ...presets[preset], preset })),
			reset: () => set(() => ({ ...presets.default, preset: 'default' }))
		}),
		{ name: 'shader-config' }
	)
)
