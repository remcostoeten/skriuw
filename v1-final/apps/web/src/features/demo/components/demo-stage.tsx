"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceBackendProvider } from "@/core/workspace-backend";
import { RichTextEditor } from "@/features/editor/components/rich-text-editor";
import { usePreferencesStore } from "@/features/settings/store";
import { DEMO_NOTES, DEMO_PEOPLE, findScene, type DemoScene } from "../scenes";

type StageProps = {
	scene: DemoScene;
	autoplay: boolean;
	loop: boolean;
};

type Props = {
	slug: string;
	autoplay: boolean;
	loop: boolean;
};

type Phase = "idle" | "counting" | "playing" | "done";

const COUNTDOWN_FROM = 3;

function DemoStage({ scene, autoplay, loop }: StageProps) {
	const [phase, setPhase] = useState<Phase>("idle");
	const [count, setCount] = useState(COUNTDOWN_FROM);
	const [runId, setRunId] = useState(0);
	const playingRef = useRef(false);

	useEffect(() => {
		usePreferencesStore.setState((state) => ({
			...state,
			editor: { ...state.editor, vimMode: Boolean(scene.vimMode) },
		}));
	}, [scene.vimMode]);

	const play = useCallback(async () => {
		if (playingRef.current) return;
		playingRef.current = true;

		setPhase("counting");
		for (let n = COUNTDOWN_FROM; n > 0; n--) {
			setCount(n);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		setPhase("playing");
		try {
			await scene.run();
		} finally {
			playingRef.current = false;
			setPhase("done");
			if (loop) {
				await new Promise((resolve) => setTimeout(resolve, 1500));
				setRunId((id) => id + 1);
			}
		}
	}, [scene, loop]);

	useEffect(() => {
		if (!autoplay && runId === 0) return;
		void play();
	}, [autoplay, runId, play]);

	const isRecording = phase === "playing";

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
			<div
				key={runId}
				className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
				style={{ width: 1280, height: 720 }}
			>
				<RichTextEditor
					content={scene.content}
					files={DEMO_NOTES}
					people={DEMO_PEOPLE}
					editorFontId="inter"
					editorLineHeight="comfortable"
					onChange={() => {}}
				/>

				{phase === "counting" ? (
					<div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
						<span className="text-8xl font-semibold tabular-nums text-foreground">
							{count}
						</span>
					</div>
				) : null}
			</div>

			<div
				className="flex items-center gap-4 transition-opacity duration-300"
				style={{ opacity: isRecording ? 0 : 1 }}
			>
				<button
					type="button"
					onClick={() => setRunId((id) => id + 1)}
					disabled={phase === "counting" || phase === "playing"}
					className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
				>
					{phase === "done" ? "Replay" : "Play"}
				</button>
				<p className="text-sm text-muted-foreground">
					{scene.title} — the stage is exactly 1280×720, so crop your recorder to the
					frame.
				</p>
			</div>
		</div>
	);
}

export function DemoStageRoot({ slug, autoplay, loop }: Props) {
	const [queryClient] = useState(() => new QueryClient());
	const scene = findScene(slug);

	if (!scene) return null;

	return (
		<QueryClientProvider client={queryClient}>
			<WorkspaceBackendProvider>
				<DemoStage scene={scene} autoplay={autoplay} loop={loop} />
			</WorkspaceBackendProvider>
		</QueryClientProvider>
	);
}
