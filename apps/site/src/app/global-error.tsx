"use client";

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

const themeScript = `(function(){try{var s=localStorage.getItem("skriuw-theme");if(s==="dark"||s==="light"){document.documentElement.dataset.theme=s}}catch(e){}})()`;

const styles = `
:root{color-scheme:light dark;--bg:#f9f6f3;--card:#ffffff;--ink-400:#99a1af;--ink-500:#6a7282;--ink-900:#101828;--line:#e5e7eb;--accent:#a05656}
:root[data-theme="dark"]{--bg:#131211;--card:#1a1817;--ink-400:#8a827c;--ink-500:#a9a19b;--ink-900:#f4f0ec;--line:#2d2928;--accent:#d99a9a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#131211;--card:#1a1817;--ink-400:#8a827c;--ink-500:#a9a19b;--ink-900:#f4f0ec;--line:#2d2928;--accent:#d99a9a}}
body{margin:0;background:var(--bg);color:var(--ink-900);font:400 16px/26px ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{margin:2.5rem auto;display:flex;min-height:calc(100svh - 5rem);width:min(1200px,calc(100% - 32px));box-sizing:border-box;flex-direction:column;justify-content:center;padding:4rem 2rem;gap:1.5rem;border-inline:1px dashed var(--line);background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:16px 16px}
.code{font:500 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-400)}
.code b{color:var(--accent);font-weight:500;margin-right:.5rem}
h1{margin:0;max-width:44rem;font:400 48px/50px ui-serif,Georgia,serif;letter-spacing:-1.6px}
p{margin:0;max-width:36rem;color:var(--ink-500)}
.row{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}
a,button{display:inline-flex;align-items:center;height:40px;padding:0 1.125rem;border-radius:6px;font:500 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;text-transform:uppercase;text-decoration:none;cursor:pointer}
button{border:1px solid transparent;background:var(--ink-900);color:var(--card)}
button:hover,button:focus-visible{background:var(--accent);color:#fff}
a{border:1px solid var(--line);background:var(--card);color:var(--ink-500)}
a:hover,a:focus-visible{color:var(--ink-900)}
.ref{font:400 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink-400)}
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
          <span className="code">
            <b>500</b>something broke
          </span>
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
