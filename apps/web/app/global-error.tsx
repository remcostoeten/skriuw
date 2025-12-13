'use client'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html lang="en">
            <body>
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <h2>Something went wrong!</h2>
                    <p style={{ color: '#666', marginBottom: '1rem' }}>
                        {error.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        onClick={() => reset()}
                        style={{
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    )
}
