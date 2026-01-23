'use client'

import { useState } from 'react'

type TState = {
  open: string | null
}

export function useFaq() {
  const [state, setState] = useState<TState>({ open: null })

  function setOpen(id: string | null) {
    setState({ open: id })
  }

  function tog(id: string) {
    setState((prev) => ({ open: prev.open === id ? null : id }))
  }

  return {
    open: state.open,
    setOpen,
    tog
  }
}
