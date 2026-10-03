import type { AppCommand } from "@/commands/registry";
import { UserIcon } from "@/shared/icons/static";
import { authConfiguration } from "./config";

export function authCommands(openSignIn: () => void): AppCommand[] {
  return [
    {
      id: "cloud-sign-in",
      label: "Sign in to Skriuw cloud",
      group: "General",
      keywords: ["account", "login", "log in", "cloud", "sync"],
      icon: <UserIcon size={15} />,
      visible: () => authConfiguration.available,
      run: openSignIn,
    },
  ];
}
