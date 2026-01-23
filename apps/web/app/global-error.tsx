'use client'
export default function GlobalError({
	error,
	reset
}: {
	error: Error & { digest?: string }
	reset: () => void
}) {
	return (
		<html lang='en'>
			<body style={{ backgroundColor: 'hsl(0 0% 7%)', color: 'white' }}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						minHeight: '100vh',
						padding: '1rem',
						fontFamily: 'system-ui, sans-serif'
					}}
				>
					<h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
						Something went wrong!
					</h2>
					<p
						style={{
							color: 'hsl(0 0% 60%)',
							marginBottom: '1.5rem',
							textAlign: 'center'
						}}
					>
						An unexpected error occurred. Please try again.
					</p>
					<button
						onClick={() => reset?.() ?? window.location.reload()}
						style={{
							padding: '0.75rem 1.5rem',
							backgroundColor: 'hsl(0 0% 15%)',
							border: '1px solid hsl(0 0% 20%)',
							borderRadius: '0.5rem',
							color: 'white',
							cursor: 'pointer',
							fontSize: '0.875rem'
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	)
}
