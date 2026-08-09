import { AuthDrawer } from "@remcostoeten/auth-drawer";
import { authAdapter } from "./adapter";

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
export function CloudSignInDrawer({ open, onOpenChange }: Props) {
  return (
    <AuthDrawer
      adapter={authAdapter}
      hideTrigger
      open={open}
      onOpenChange={onOpenChange}
      config={{
        ui: {
          auth: {
            providers: [],
            allowRegister: true,
            showForgotPassword: false,
            showRememberMe: true,
          },
          presentation: { variant: "drawer" },
        },
      }}
    />
  );
}

export default CloudSignInDrawer;
