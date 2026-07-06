"use client";

import { useEffect, useRef } from "react";
import type { CommitEvent } from "./fiber-render-tracker";

type Flash = {
	rect: DOMRect;
	name: string;
	heat: number;
	bornAt: number;
};

const FLASH_LIFETIME_MS = 600;
const MAX_FLASHES = 120;

type Props = {
	commits: (listener: (commit: CommitEvent) => void) => () => void;
	heatFor: (name: string) => number;
};

/**
 * Full-viewport, pointer-transparent canvas that flashes an outline over every
 * component that just re-rendered. Outline color runs from the theme accent
 * (occasional render) to hot red (rendering many times per second), fading out
 * over ~0.6s.
 */
export function RenderOverlay({ commits, heatFor }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const flashesRef = useRef<Flash[]>([]);

	useEffect(() => {
		const unsubscribe = commits((commit) => {
			const now = performance.now();
			for (const render of commit.renders) {
				if (!render.rect || render.rect.width === 0 || render.rect.height === 0) continue;
				flashesRef.current.push({
					rect: render.rect,
					name: render.name,
					heat: heatFor(render.name),
					bornAt: now,
				});
			}
			if (flashesRef.current.length > MAX_FLASHES) {
				flashesRef.current = flashesRef.current.slice(-MAX_FLASHES);
			}
		});
		return () => unsubscribe();
	}, [commits, heatFor]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext("2d");
		if (!context) return;

		let rafId = 0;
		let running = true;

		function resize() {
			if (!canvas) return;
			const scale = window.devicePixelRatio || 1;
			canvas.width = window.innerWidth * scale;
			canvas.height = window.innerHeight * scale;
			context?.setTransform(scale, 0, 0, scale, 0, 0);
		}
		resize();
		window.addEventListener("resize", resize);

		function draw() {
			if (!running || !context || !canvas) return;
			const now = performance.now();
			context.clearRect(0, 0, window.innerWidth, window.innerHeight);

			flashesRef.current = flashesRef.current.filter(
				(flash) => now - flash.bornAt < FLASH_LIFETIME_MS,
			);

			for (const flash of flashesRef.current) {
				const life = 1 - (now - flash.bornAt) / FLASH_LIFETIME_MS;
				const heat = Math.min(1, flash.heat);
				const hue = 160 - heat * 160;
				context.strokeStyle = `hsla(${hue}, 90%, 55%, ${0.85 * life})`;
				context.lineWidth = 1 + heat * 1.5;
				context.strokeRect(flash.rect.x, flash.rect.y, flash.rect.width, flash.rect.height);

				if (heat > 0.5 && flash.rect.width > 60) {
					context.font = "10px ui-monospace, monospace";
					context.fillStyle = `hsla(${hue}, 90%, 65%, ${life})`;
					context.fillText(flash.name, flash.rect.x + 4, flash.rect.y + 12);
				}
			}

			rafId = requestAnimationFrame(draw);
		}
		rafId = requestAnimationFrame(draw);

		return () => {
			running = false;
			cancelAnimationFrame(rafId);
			window.removeEventListener("resize", resize);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 2147483646,
			}}
		/>
	);
}
