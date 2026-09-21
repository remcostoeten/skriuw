import { RoutePlaceholder } from "@/shell/route-views";

export default function PeopleRoute() {
  return (
    <RoutePlaceholder
      route="people"
      detail="Browsing people is not on mobile yet. Search for $name or person:name to find the notes mentioning someone."
    />
  );
}
