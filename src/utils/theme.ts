/**
 * Theme utilities for managing user-configurable accent colors
 * Single base color automatically generates harmonious variations
 */

export type AccentColorVariations = {
  base: string
  dark: string
  darker: string
  bg: string
  bgHover: string
  subtle: string
  glow: string
}

export type OKLCH = {
  l: number // 0-1
  c: number // 0-0.37
  h: number // 0-360
}

export const presetAccentColors: Record<string, string> = {
  teal: '#4ec9b0',
  blue: '#3b82f6',
  green: '#10b981',
  purple: '#8b5cf6',
  red: '#ef4444',
  orange: '#f97316',
  pink: '#ec4899',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  emerald: '#059669',
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c'
}

/**
 * Convert hex color to OKLCH color space
 */
export function hexToOklch(hex: string): OKLCH {
  // Remove # and convert to RGB
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255

  // Convert RGB to linear RGB
  const linearR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const linearG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const linearB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  // Convert linear RGB to XYZ
  const x = 0.4124564 * linearR + 0.3575761 * linearG + 0.1804375 * linearB
  const y = 0.2126729 * linearR + 0.7151522 * linearG + 0.0721750 * linearB
  const z = 0.0193339 * linearR + 0.1191920 * linearG + 0.9503041 * linearB

  // Convert XYZ to OKLab
  const l = Math.cbrt(x * 1.22701385 + y * -0.55779999 + z * 0.28125615)
  const m = Math.cbrt(x * -0.04058018 + y * 1.11225687 + z * -0.07167669)
  const s = Math.cbrt(x * -0.07638128 + y * -0.13600826 + z * 1.38638954)

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const aPrime = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bPrime = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s

  // Convert OKLab to OKLCH
  const chroma = Math.sqrt(aPrime * aPrime + bPrime * bPrime)
  const hue = Math.atan2(bPrime, aPrime) * (180 / Math.PI)

  return {
    l: Math.max(0, Math.min(1, L)),
    c: Math.max(0, Math.min(0.37, chroma)),
    h: hue < 0 ? hue + 360 : hue
  }
}

/**
 * Convert OKLCH back to hex
 */
export function oklchToHex(oklch: OKLCH): string {
  const { l, c, h } = oklch

  // Convert OKLCH to OKLab
  const aPrime = c * Math.cos(h * Math.PI / 180)
  const bPrime = c * Math.sin(h * Math.PI / 180)

  // Convert OKLab to XYZ
  const lmsL = (l + 0.3963377774 * aPrime + 0.2158037573 * bPrime) ** 3
  const lmsM = (l - 0.1055613458 * aPrime - 0.0638541728 * bPrime) ** 3
  const lmsS = (l - 0.0894841775 * aPrime - 1.2914855480 * bPrime) ** 3

  const x = 1.22701385 * lmsL - 0.55779999 * lmsM + 0.28125615 * lmsS
  const y = -0.04058018 * lmsL + 1.11225687 * lmsM - 0.07167669 * lmsS
  const z = 0.02590404 * lmsL - 0.13600826 * lmsM + 1.38638954 * lmsS

  // Convert XYZ to linear RGB
  const linearR = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const linearG = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
  const linearB = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z

  // Convert linear RGB to sRGB
  const r = Math.max(0, Math.min(1, linearR <= 0.0031308 ? 12.92 * linearR : 1.055 * linearR ** (1 / 2.4) - 0.055))
  const g = Math.max(0, Math.min(1, linearG <= 0.0031308 ? 12.92 * linearG : 1.055 * linearG ** (1 / 2.4) - 0.055))
  const b = Math.max(0, Math.min(1, linearB <= 0.0031308 ? 12.92 * linearB : 1.055 * linearB ** (1 / 2.4) - 0.055))

  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Generate color variations from a base color using OKLCH
 */
export function generateAccentVariations(baseHex: string): AccentColorVariations {
  const baseOklch = hexToOklch(baseHex)

  // Generate variations by adjusting lightness and chroma
  const dark: OKLCH = {
    l: Math.max(0.2, baseOklch.l - 0.12),
    c: Math.max(0.05, baseOklch.c - 0.02),
    h: baseOklch.h
  }

  const darker: OKLCH = {
    l: Math.max(0.15, baseOklch.l - 0.22),
    c: Math.max(0.03, baseOklch.c - 0.04),
    h: baseOklch.h
  }

  const bg: OKLCH = {
    l: Math.max(0.08, baseOklch.l - 0.35),
    c: Math.max(0.02, baseOklch.c - 0.06),
    h: baseOklch.h
  }

  const bgHover: OKLCH = {
    l: Math.max(0.12, baseOklch.l - 0.28),
    c: Math.max(0.03, baseOklch.c - 0.05),
    h: baseOklch.h
  }

  return {
    base: baseHex,
    dark: oklchToHex(dark),
    darker: oklchToHex(darker),
    bg: oklchToHex(bg),
    bgHover: oklchToHex(bgHover),
    subtle: hexToRgba(baseHex, 0.15),
    glow: hexToRgba(baseHex, 0.3)
  }
}

/**
 * Convert hex to RGBA string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Update the accent color system with a new base color
 */
export function updateAccentColor(baseHex: string) {
  const variations = generateAccentVariations(baseHex)
  const root = document.documentElement

  // Update all CSS custom properties
  root.style.setProperty('--accent-base', variations.base)
  root.style.setProperty('--accent', variations.base)
  root.style.setProperty('--accent-dark', variations.dark)
  root.style.setProperty('--accent-darker', variations.darker)
  root.style.setProperty('--accent-bg', variations.bg)
  root.style.setProperty('--accent-bg-hover', variations.bgHover)
  root.style.setProperty('--accent-subtle', variations.subtle)
  root.style.setProperty('--accent-glow', variations.glow)

  // Also update OKLCH versions for CSS calculations
  const baseOklch = hexToOklch(baseHex)
  root.style.setProperty('--accent-oklch', `${baseOklch.l.toFixed(2)} ${baseOklch.c.toFixed(2)} ${baseOklch.h.toFixed(0)}`)
}

/**
 * Update accent color by preset name
 */
export function updateAccentColorPreset(presetName: keyof typeof presetAccentColors) {
  const color = presetAccentColors[presetName]
  if (color) {
    updateAccentColor(color)
  }
}

/**
 * Get current base accent color
 */
export function getCurrentAccentColor(): string {
  const root = document.documentElement
  const computedStyle = getComputedStyle(root)
  return computedStyle.getPropertyValue('--accent-base').trim() || presetAccentColors.teal
}

/**
 * Get all current accent color variations
 */
export function getCurrentAccentVariations(): AccentColorVariations {
  const root = document.documentElement
  const computedStyle = getComputedStyle(root)

  return {
    base: computedStyle.getPropertyValue('--accent-base').trim(),
    dark: computedStyle.getPropertyValue('--accent-dark').trim(),
    darker: computedStyle.getPropertyValue('--accent-darker').trim(),
    bg: computedStyle.getPropertyValue('--accent-bg').trim(),
    bgHover: computedStyle.getPropertyValue('--accent-bg-hover').trim(),
    subtle: computedStyle.getPropertyValue('--accent-subtle').trim(),
    glow: computedStyle.getPropertyValue('--accent-glow').trim()
  }
}

/**
 * Save accent color preference to localStorage
 */
export function saveAccentColorPreference(baseHex: string) {
  try {
    localStorage.setItem('accent-color', baseHex)
  } catch (error) {
    console.warn('Failed to save accent color preference:', error)
  }
}

/**
 * Load accent color preference from localStorage
 */
export function loadAccentColorPreference(): string | null {
  try {
    return localStorage.getItem('accent-color')
  } catch (error) {
    console.warn('Failed to load accent color preference:', error)
    return null
  }
}

/**
 * Initialize accent color from saved preference or default
 */
export function initializeAccentColor() {
  const savedColor = loadAccentColorPreference()
  if (savedColor) {
    updateAccentColor(savedColor)
  }
}