"use client";

import { useState, useTransition } from "react";

import { loadComparison } from "../api/actions/load-comparison";
import type { Comparison } from "../api/queries/get-comparison";

export function useComparison(id: number) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (pending) {
      return;
    }

    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);

    if (data) {
      return;
    }

    setError(null);

    startTransition(async function load() {
      try {
        const result = await loadComparison(id);

        if (result.ok) {
          setData(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Connection failed. Please try again.");
      }
    });
  }

  return {
    open,
    data,
    error,
    pending,
    toggle,
  };
}
