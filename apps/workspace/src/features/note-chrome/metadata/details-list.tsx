import { CopyIcon } from "@/shared/icons/static";
import { showToast } from "@/shared/ui/toast";
import { inspectorIconButton } from "./inspector-classes";
import { readingMinutes } from "./inspector-model";

type Props = {
  wordCount: number;
  markdown: string | null;
  createdAt: number | null;
  updatedAt: number;
  originPath: string | null;
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Bytes`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function copyPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
    showToast({ message: "Path copied" });
  } catch {
    showToast({ message: "Could not copy the path." });
  }
}

export function DetailsList({ wordCount, markdown, createdAt, updatedAt, originPath }: Props) {
  const rows = [
    { label: "Words", value: wordCount.toLocaleString() },
    { label: "Characters", value: (markdown?.length ?? 0).toLocaleString() },
    { label: "Read time", value: `${readingMinutes(wordCount)}m` },
    ...(markdown === null
      ? []
      : [{ label: "File size", value: formatFileSize(utf8ByteLength(markdown)) }]),
    ...(createdAt === null ? [] : [{ label: "Created", value: formatDateTime(createdAt) }]),
    { label: "Updated", value: formatDateTime(updatedAt) },
  ];

  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-2 text-[12.5px]">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="m-0 text-right tabular-nums text-foreground/85">{row.value}</dd>
        </div>
      ))}
      {originPath !== null && (
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-muted-foreground">Original path</dt>
          <dd className="m-0 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 select-text break-all font-mono text-[11px] text-muted-foreground"
              title={originPath}
            >
              {originPath}
            </code>
            <button
              type="button"
              aria-label="Copy original path"
              title="Copy path"
              onClick={() => void copyPath(originPath)}
              className={inspectorIconButton}
            >
              <CopyIcon size={13} />
            </button>
          </dd>
        </div>
      )}
    </dl>
  );
}
