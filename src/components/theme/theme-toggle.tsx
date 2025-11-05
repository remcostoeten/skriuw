"use client"

import { useEffect, useState, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

function applyTheme(next: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(next)
  try {
    localStorage.setItem('theme', next)
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const root = document.documentElement
    const current = root.classList.contains('light') ? 'light' : root.classList.contains('dark') ? 'dark' : 'dark'
    setTheme(current)
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  if (!mounted) return null

  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" title="Toggle theme" onClick={toggle}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  )
}
