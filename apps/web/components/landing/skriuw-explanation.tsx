import { Button } from '../ui/button'
import { Kbd } from '../ui/kbd'
import { BrandLogo } from '../brand-logo'

type Props = {
	onCreateNote: () => void
	onOpenCollection: () => void
}

export function SkriuwExplanation({ onCreateNote, onOpenCollection }: Props) {
	return (
		<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
			<div className="flex flex-col items-center gap-6 mb-8">
				<div className="flex flex-col items-center gap-3">
					<BrandLogo size={120} className="mb-4" />
					<h1 className="text-4xl font-bold text-foreground font-brand">Skriuw</h1>
					<div className="flex flex-col items-center gap-1 text-muted-foreground">
						<p className="text-sm italic">
							<span className="font-mono">/skrɪu̯/</span> —{' '}
							<span className="font-medium">Frisian, &quot;to write.&quot;</span>
						</p>
					</div>
				</div>

				<div className="max-w-lg text-center">
					<p className="text-sm text-muted-foreground leading-relaxed">
						A blazingly fast, privacy-focused note-taking app built for everyone. Providing an
						opt-in system for all features (yes, AI is included) rather than the usual opt-out
						system. The tools are here, you just need to opt-in.
					</p>
				</div>
			</div>

			<div className="flex flex-row items-center gap-4 mt-8">
				<Button
					variant="secondary"
					size="lg"
					onClick={onOpenCollection}
					className="gap-3 pr-2"
				>
					Open Collection
					<Kbd>⌘O</Kbd>
				</Button>
				<Button
					variant="default"
					size="lg"
					onClick={onCreateNote}
					className="gap-3 pr-2"
				>
					Create Note
					<Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘N</Kbd>
				</Button>
			</div>
		</div>
	)
}
