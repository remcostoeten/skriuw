export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <h1 className="text-9xl font-bold text-foreground">404</h1>
      <p className="mt-4 text-xl text-muted-foreground">Page not found</p>
      <a
        href="/"
        className="mt-8 inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Go back home
      </a>
    </main>
  );
}