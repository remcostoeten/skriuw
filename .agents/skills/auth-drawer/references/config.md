# Configuration (`AuthConfig`)

`AuthDrawer` takes an optional `config?: AuthConfig`. Every field is optional and
deep-merged over `DEFAULT_CONFIG`. Import `DEFAULT_CONFIG` from the package to
read or extend the defaults.

```ts
type AuthConfig = {
  ui?: AuthUiConfig;            // appearance + form behavior
  triggers?: AuthTriggerConfig; // see triggers.md
  normalizeError?: AuthErrorNormalizer; // see errors.md
};
```

## The `ui` namespace

```ts
type AuthUiConfig = {
  auth?: AuthConfigGroup;          // providers, flags, initial mode, email autocomplete
  copy?: AuthCopyConfig;           // all user-facing strings
  presentation?: AuthPresentationConfig;  // drawer vs modal, defaultOpen
  visual?: { backdrop?: AuthBackdropConfig };
  motion?: Partial<MotionSettings>; // low-level drag/entry/exit/layout tuning
  footer?: ReactNode;              // fully custom footer; overrides copy.footer
};
```

### `ui.auth` — form behavior and providers

```ts
type AuthConfigGroup = {
  providers?: OAuthProvider[];     // [] disables OAuth entirely
  oauthLayout?: "row" | "column";
  oauthOverflow?: { visibleCount?: number; showPreviewIcons?: boolean };
  allowRegister?: boolean;
  showRememberMe?: boolean;
  initialMode?: "login" | "register" | "resetPassword";
  showForgotPassword?: boolean;
  showLivePasswordMatch?: boolean;
  showFooter?: boolean;
  emailAutocomplete?: { enabled?: boolean; domains?: string[] };
};
```

Valid `OAuthProvider` values: `github`, `google`, `apple`, `discord`, `tiktok`.

> Note: these flags refine UI that the **adapter already enables**. They cannot
> reveal a tab the adapter doesn't support — e.g. `allowRegister: true` does
> nothing if the adapter has no `signUp`. See adapters.md feature detection.

### `ui.presentation` — drawer or modal

```ts
type AuthPresentationConfig = {
  variant?: "drawer" | "modal";   // default "drawer"
  defaultOpen?: boolean;          // open on mount (uncontrolled)
};
```

### `ui.visual.backdrop` — backdrop styling

```ts
type AuthBackdropConfig = {
  color?: string;
  opacity?: number;
  blur?: number;                  // px
  gradient?: { angle?: number; from?: string; to?: string; fromPos?: number; toPos?: number };
};
```

### `ui.motion` — drag/animation/layout (advanced)

`Partial<MotionSettings>` — fine-grained Framer Motion + layout tuning. Keys
include `displayMode`, `desktopWidth`, `desktopPosition` (`center`/`left`/`right`),
drag physics (`upwardResistance`, `downwardThreshold`, `velocityThreshold`,
`snapStiffness`, `snapDamping`, `snapMass`), entry/exit timing (`entryDuration`,
`entryDelay`, `entryScale`, `entryY`, `entryEase`, and the `exit*` equivalents),
backdrop motion, and form layout (`formPaddingTop`, `formJustify`, etc.). Only set
what you need; the rest come from defaults. Most apps never touch this.

### `ui.copy` — text overrides

Override any label, heading, button text, or message via `AuthCopyConfig`. Groups
include fields, form, oauth, rememberMe, forgotPassword, footer, validation,
close, and trigger copy. For a fully custom footer node, use `ui.footer` (it
overrides `copy.footer` segments). Use `formatCopy` / `resolveCopyGroup` /
`DEFAULT_COPY` (exported from the package) if you need to compute copy.

## `DEFAULT_CONFIG` (current defaults)

```ts
{
  ui: {
    auth: {
      providers: ["github", "google"],
      oauthLayout: "column",
      allowRegister: true,
      showRememberMe: true,
      initialMode: "login",
      showForgotPassword: true,
      showLivePasswordMatch: true,
      emailAutocomplete: {
        enabled: true,
        domains: ["gmail.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com"],
      },
    },
    presentation: { variant: "drawer", defaultOpen: false },
    visual: {
      backdrop: {
        color: "#070708", opacity: 0.85, blur: 6,
        gradient: { angle: 180, from: "transparent", to: "#070708", fromPos: 100, toPos: 100 },
      },
    },
    motion: { displayMode: "drawer", desktopWidth: "448px", desktopPosition: "center" /* + drag/entry/exit */ },
  },
  triggers: {},
}
```

## Email autocomplete

The email field offers inline domain completion when the user types `@`.

```ts
// disable
config = { ui: { auth: { emailAutocomplete: { enabled: false } } } };

// custom domains
config = { ui: { auth: { emailAutocomplete: { enabled: true, domains: ["company.com", "gmail.com"] } } } };
```

## CSS theme tokens

Override the shipped overlay theme with the existing CSS custom properties. The
tokens use HSL components, not hex values:

```css
:root {
  --surface-overlay: 34 12% 82%;
  --text-on-overlay: 24 18% 14%;
  --border-overlay: 28 12% 54%;
}

.dark {
  --surface-overlay: 0 0% 7.5%;
  --text-on-overlay: 0 0% 96%;
  --border-overlay: 0 0% 100%;
}
```

There is no `cad-*` theme API; use the tokens above when documenting
customization.

## Controlled vs uncontrolled open state

`AuthDrawer` props beyond `adapter`/`config`:

- `hideTrigger?: boolean` — hide the built-in floating trigger button; open the
  drawer from your own UI instead.
- `open?: boolean` + `onOpenChange?: (open) => void` — controlled mode. If you
  pass `open`, it takes precedence over provider-managed and uncontrolled state,
  and you must update it from `onOpenChange` (fires on drag-dismiss, backdrop
  click, Escape, close button).
- `defaultOpen?: boolean` — uncontrolled initial open state (ignored if `open`
  is set).
- `className?: string` — classes on the built-in trigger button.
- `onSuccess` / `onError` — lifecycle callbacks (`action` is
  `"signIn" | "signUp" | "signOut" | "oauth"`).
- `triggerStore?: AuthTriggerStore` — see triggers.md.
