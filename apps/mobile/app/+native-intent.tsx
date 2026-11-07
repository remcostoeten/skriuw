import { quickActionFromUrl, quickActionInbox } from "@/features/quick-actions/quick-actions";

type Props = {
  path: string;
  initial: boolean;
};

export function redirectSystemPath({ path, initial }: Props): string | null {
  const action = quickActionFromUrl(path);
  if (action === null) {
    return path;
  }
  quickActionInbox.deliver(action);
  return initial ? "/" : null;
}
