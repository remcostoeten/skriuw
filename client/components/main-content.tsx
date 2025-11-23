export function MainContent() {
  return (
    <div className="flex-1 bg-background overflow-y-auto">
      <div className="max-w-[719px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10">
        <div className="flex flex-col gap-1">
          <div className="px-4 sm:px-8 py-2.5 flex justify-center">
            <h1 className="text-3xl sm:text-4xl text-foreground font-normal leading-tight sm:leading-10">README</h1>
          </div>

          <div className="max-w-[587px] mx-auto w-full">
            <div className="mb-6 sm:mb-8">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">
                Skriuw is a new local-first & privacy-focused, open-source home for your
                markdown notes. It's minimal, lightweight, efficient, and aims to have{' '}
                <em>all you need and nothing you don't</em>.
              </p>
            </div>

            <div className="border-t border-border my-8 sm:my-12"></div>

            <div className="mb-6 sm:mb-8">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">
                If you'd like to learn more about Skriuw, why it's being built, what its goals are,
                and how it differs from all the other markdown editors out there, click around
                the other files in this collection.
              </p>
            </div>

            <h2 className="text-xl sm:text-2xl text-foreground font-normal leading-7 sm:leading-8 mb-6 sm:mb-8">Tech Stack</h2>

            <ul className="pl-4 sm:pl-6 mb-8 sm:mb-12 space-y-1">
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Tauri</a> – Desktop App
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">PGlite</a> – Local Database
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Svelte</a> – Framework
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Tailwind</a> – CSS
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Shadcn/ui</a> – Component Library
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Vercel</a> – Hosting
              </li>
            </ul>

            <h2 className="text-xl sm:text-2xl text-foreground font-normal leading-7 sm:leading-8 mb-6 sm:mb-8">Deploy Your Own</h2>

            <div className="mb-8 sm:mb-12">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">
                If you're interested in self-hosting your own web instance of Skriuw, please check{' '}
                <a href="#" className="text-primary underline hover:no-underline">GitHub</a> for instructions.
              </p>
            </div>

            <h2 className="text-xl sm:text-2xl text-foreground font-normal leading-7 sm:leading-8 mb-6 sm:mb-8">Roadmap</h2>

            <div className="mb-6 sm:mb-8">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">
                Skriuw is currently still in active development. Here are some of the features
                planned for the future:
              </p>
            </div>

            <div className="space-y-2 mb-8 sm:mb-12">
              <div className="flex items-start gap-2 pl-1.5">
                <div className="flex items-center justify-center mt-1">
                  <div className="w-[19px] h-[19px] rounded-md border border-border shrink-0"></div>
                </div>
                <div className="flex-1 py-0.5">
                  <p className="text-sm sm:text-base text-muted-foreground leading-5">Skriuw Sync</p>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-1.5">
                <div className="flex items-center justify-center mt-1">
                  <div className="w-[19px] h-[19px] rounded-md border border-border shrink-0"></div>
                </div>
                <div className="flex-1 py-0.5">
                  <p className="text-sm sm:text-base text-muted-foreground leading-5">
                    Mobile support for the web app (Currently dependent on PGlite support for mobile)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-1.5">
                <div className="flex items-center justify-center mt-1">
                  <div className="w-[19px] h-[19px] rounded-md border border-border shrink-0"></div>
                </div>
                <div className="flex-1 py-0.5">
                  <p className="text-sm sm:text-base text-muted-foreground leading-5">Native mobile apps for iOS & Android</p>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-1.5">
                <div className="flex items-center justify-center mt-1">
                  <div className="w-[19px] h-[19px] rounded-md border border-border shrink-0"></div>
                </div>
                <div className="flex-1 py-0.5">
                  <p className="text-sm sm:text-base text-muted-foreground leading-5">Windows & Linux support for the desktop app</p>
                </div>
              </div>
            </div>

            <div className="mb-8 sm:mb-12">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">and much, much more, so stay tuned!</p>
            </div>

            <h2 className="text-xl sm:text-2xl text-foreground font-normal leading-7 sm:leading-8 mb-6 sm:mb-8">Contributing</h2>

            <div className="mb-4">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">We would love to have your help in making Skriuw better!</p>
            </div>

            <div className="mb-4">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">Here's how you can contribute:</p>
            </div>

            <ul className="pl-4 sm:pl-6 mb-8 sm:mb-12 space-y-1">
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Report a bug</a> you found while using Skriuw
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Request a feature</a> that you think will be useful
              </li>
              <li className="text-sm sm:text-base text-muted-foreground leading-6 sm:leading-7">
                <a href="#" className="text-primary underline hover:no-underline">Submit a pull request</a> if you want to contribute with new features or bug fixes
              </li>
            </ul>

            <h2 className="text-xl sm:text-2xl text-foreground font-normal leading-7 sm:leading-8 mb-6 sm:mb-8">License</h2>

            <div className="mb-8 sm:mb-12">
              <p className="text-sm sm:text-base text-muted-foreground leading-5">
                Skriuw is licensed under the{' '}
                <a href="#" className="text-primary underline hover:no-underline">
                  GNU Affero General Public License Version 3 (AGPLv3)
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
