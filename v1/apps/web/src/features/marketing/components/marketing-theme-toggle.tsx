"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { noop } from "@/shared/lib/noop";

type Mode = "light" | "dark";

export function MarketingThemeToggle() {
	const [mode, setMode] = useState<Mode>("light");

	useEffect(() => {
		if (document.documentElement.getAttribute("data-mk") === "dark") {
			setMode("dark");
		}
	}, []);

	function toggle() {
		const next: Mode = mode === "dark" ? "light" : "dark";
		document.documentElement.setAttribute("data-mk", next);
		setMode(next);
		try {
			localStorage.setItem("skriuw-mk", next);
		} catch {
			noop();
		}
	}

	return (
		<button
			type="button"
			onClick={() => toggle()}
			aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
			className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mk-border)] bg-[var(--mk-card)] text-[var(--mk-sub)] transition-[background-color,color,transform] duration-200 hover:text-[var(--mk-ink)] active:scale-95"
		>
			<span className="relative block h-4 w-4">
				<Sun
					className={`absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-300 ${mode === "dark" ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`}
					strokeWidth={2}
				/>
				<Moon
					className={`absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-300 ${mode === "dark" ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`}
					strokeWidth={2}
				/>
			</span>
		</button>
	);
}
