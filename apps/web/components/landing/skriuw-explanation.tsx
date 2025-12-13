import { EmptyState } from '../ui/empty-state'
import { shortcut } from '../../features/shortcuts'

type Props = {
	onCreateNote: () => void
	onOpenCollection: () => void
}

export function SkriuwExplanation({ onCreateNote, onOpenCollection }: Props) {
	return (
		<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
			<div className="flex flex-col items-center gap-6 mb-8">
				<div className="flex flex-col items-center gap-3">
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
			<div>
				<ul>
					<li>todo: tabs settings remove emojis en show reorder gif</li>
					<li>todo: better empty state with search (21st.dev</li>
					<li>User menu tyling</li>
					<li>login flow</li>
					<li>DISABLE_AUTO_SIGNIN env validation </li>
				</ul>
			</div>
			<EmptyState
				actions={[
					{
						label: 'Open Collection',
						shortcut: shortcut().modifiers('Cmd').key('O'),
						separator: true,
						onClick: onOpenCollection,
					},
					{
						label: 'Create Note',
						shortcut: shortcut().modifiers('Cmd').key('N'),
						separator: true,
						onClick: onCreateNote,
					},
				]}
			/>
		</div>
	)
}
