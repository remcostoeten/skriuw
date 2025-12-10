'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@skriuw/ui'
import { Icons } from '@skriuw/ui'

export default function Index() {
	const router = useRouter()

	function handleGoToApp() {
		router.push('/app')
	}

	return (
		<div className="flex-1 flex items-center justify-center min-h-screen">
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
							A blazingly fast, privacy-focused note-taking app built for everyone. Providing a
							opt-in system for all features (yes, ai is included) rather than the usual opt-out
							system. The tools are here, you just need to opt-in.
						</p>
					</div>
				</div>

				<Button onClick={handleGoToApp} size="lg" className="text-base px-8 py-3">
					<Icons.chevronRight className="mr-2 h-4 w-4" />
					Open App
				</Button>
			</div>
		</div>
	)
}
