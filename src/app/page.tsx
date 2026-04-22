import  Link  from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-8">
      <div className="text-center">
        <h1 className="text-4xl font-medium text-foreground">Hello, world.</h1>
        <p className="mt-2 text-balance max-w-l text-sm text-muted-foreground">
          Skriuw. A calm, keyboard-first notes and journal workspace. <br/>Go to the app <Link className='underline' href='/app'>here</Link>
        </p>
      </div>
    </main>
  );
}
