export type TransferReport = {
  title: string;
  lines: readonly string[];
};

type TransferReportListener = (report: TransferReport) => void;

let listener: TransferReportListener | null = null;
let pending: TransferReport | null = null;

export function registerTransferReportListener(next: TransferReportListener): () => void {
  listener = next;
  if (pending) {
    const report = pending;
    pending = null;
    next(report);
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Surfaces an export/import summary in the transfer report dialog. When the
 * host is not mounted yet the report is queued and replayed on registration.
 */
export function publishTransferReport(report: TransferReport): void {
  if (listener) {
    listener(report);
  } else {
    pending = report;
  }
}

export function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

export function reportFailure(title: string, error: unknown): void {
  publishTransferReport({
    title,
    lines: [error instanceof Error ? error.message : String(error)],
  });
}
