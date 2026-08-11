import { useEffect, useState } from "react";
import { Dialog } from "@/shared/ui/dialog";
import { registerTransferReportListener } from "./transfer-report";
import type { TransferReport } from "./transfer-report";

export function TransferReportHost() {
  const [report, setReport] = useState<TransferReport | null>(null);
  useEffect(() => registerTransferReportListener((next) => setReport(next)), []);
  if (!report) {
    return null;
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setReport(null);
        }
      }}
      title={report.title}
      className="transfer-report-dialog"
    >
      <div className="flex flex-col gap-1.5 px-3.5 py-3 text-[13px] text-muted-foreground">
        {report.lines.map((line) => (
          <p key={line} className="m-0 break-all">
            {line}
          </p>
        ))}
      </div>
    </Dialog>
  );
}
