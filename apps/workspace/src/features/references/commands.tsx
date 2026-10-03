import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import type { AppCommand } from "@/commands/registry";
import { CircleIcon, WaypointsIcon } from "@/shared/icons/static";
import { requestEntityCreate } from "./shell";

export function referenceCommands(navigate: (route: AppRoute) => void): AppCommand[] {
  return [
    {
      id: "new-tag",
      label: "New tag",
      group: "Actions",
      keywords: ["create", "tag", "label"],
      icon: <WaypointsIcon size={15} />,
      shortcut: "createTag",
      run: () => {
        navigate("tags");
        requestEntityCreate("tag");
      },
    },
    {
      id: "new-person",
      label: "New person",
      group: "Actions",
      keywords: ["create", "person", "people", "mention"],
      icon: <CircleIcon size={15} />,
      shortcut: "createPerson",
      run: () => {
        navigate("people");
        requestEntityCreate("person");
      },
    },
  ];
}
