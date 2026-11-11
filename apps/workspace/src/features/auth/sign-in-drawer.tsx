import { AuthDrawer, type OAuthProvider } from "@remcostoeten/auth-drawer";
import { useEffect, useState } from "react";
import { authAdapter } from "./better-auth/adapter";
import { authConfiguration } from "./config";
import { loadCloudProviders } from "./oauth/providers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Shell-level sign-in surface. The drawer portals to `#auth-drawer-portal`
 * on `<body>`, which sits below the top layer and turns inert while a modal
 * `<dialog>` is open — so it must be mounted outside every dialog and callers
 * (settings, command palette) close their dialog before opening it.
 */
function useCloudProviders(open: boolean): OAuthProvider[] {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    if (!open || !authConfiguration.available) return;
    let current = true;
    loadCloudProviders(authConfiguration.baseUrl)
      .then((loaded) => {
        if (current) setProviders(loaded);
      })
      .catch((error) => console.error("cloud sign-in providers could not be loaded", error));
    return () => {
      current = false;
    };
  }, [open]);

  return providers;
}

export function CloudSignInDrawer({ open, onOpenChange }: Props) {
  const providers = useCloudProviders(open);
  return (
    <AuthDrawer
      adapter={authAdapter}
      hideTrigger
      open={open}
      onOpenChange={onOpenChange}
      config={{
        ui: {
          auth: {
            providers,
            allowRegister: true,
            showForgotPassword: false,
            showRememberMe: false,
          },
          presentation: { variant: "drawer" },
        },
      }}
    />
  );
}

export default CloudSignInDrawer;
