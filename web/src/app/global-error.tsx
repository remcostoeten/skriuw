"use client";

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

const themeScript = `(function(){try{var s=localStorage.getItem("skriuw-theme");if(s==="dark"||s==="light"){document.documentElement.dataset.theme=s}}catch(e){}})()`;

const styles = `
:root{color-scheme:light dark;--surface:#ffffff;--ink-400:#99a1af;--ink-500:#6a7282;--ink-900:#101828;--border:#e5e7eb;--action:#4d4444;--action-fg:#ffffff}
:root[data-theme="dark"]{--surface:#131211;--ink-400:#8a827c;--ink-500:#a9a19b;--ink-900:#f4f0ec;--border:#2d2928;--action:#eee9e4;--action-fg:#171514}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--surface:#131211;--ink-400:#8a827c;--ink-500:#a9a19b;--ink-900:#f4f0ec;--border:#2d2928;--action:#eee9e4;--action-fg:#171514}}
body{margin:0;background:var(--surface);color:var(--ink-900);font:400 16px/26px ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{margin:0 auto;display:flex;min-height:100svh;max-width:72rem;flex-direction:column;justify-content:center;padding:6rem 1.25rem;gap:1.5rem}
.code{font:400 13px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-400)}
h1{margin:0;max-width:44rem;font:400 44px/48px ui-serif,Georgia,serif;letter-spacing:-.9px;border-left:1px solid var(--ink-900);padding-left:1.25rem}
p{margin:0;max-width:36rem;color:var(--ink-500)}
.row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.75rem}
a,button{display:inline-flex;align-items:center;height:45px;padding:0 1.25rem;border-radius:.25rem;font:500 15px ui-sans-serif,system-ui,sans-serif;text-decoration:none;cursor:pointer}
button{border:0;background:var(--action);color:var(--action-fg)}
a{border:1px solid var(--border);background:var(--surface);color:var(--ink-900)}
.ref{font:400 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink-400)}
`;

export default function GlobalError({ error, retry }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong | Skriuw</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <div className="wrap">
          <span className="code">Error / Something broke</span>
          <h1>Skriuw.com failed to load.</h1>
          <p>
            The site crashed before it could render anything. Retrying often works. Your notes are
            stored on your own machine and are not affected by this.
          </p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            <a href="/">Back to the homepage</a>
          </div>
          {error.digest ? <p className="ref">Reference: {error.digest}</p> : null}
        </div>
      </body>
    </html>
  );
}
