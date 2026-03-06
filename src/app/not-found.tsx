import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-2xl font-medium text-foreground">Page not found</h1>
      <p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="rounded-md bg-haptic-btn-fill px-4 py-2 text-sm text-foreground transition-colors hover:bg-haptic-hover"
      >
        Go home
      </Link>
    </main>
  )
}
