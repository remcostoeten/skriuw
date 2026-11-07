import { File, Paths } from "expo-file-system";
import { appendColdStart, parseColdStarts, type ColdStartSample } from "./cold-start";

const LOG_FILE_NAME = "skriuw-cold-starts.json";

function logFile(): File {
  return new File(Paths.document, LOG_FILE_NAME);
}

export function readColdStarts(): ColdStartSample[] {
  try {
    const file = logFile();
    return file.exists ? parseColdStarts(file.textSync()) : [];
  } catch (error) {
    console.warn("cold start history is unreadable", error);
    return [];
  }
}

export function recordColdStart(sample: ColdStartSample): void {
  const file = logFile();
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: false });
  }
  file.writeSync(JSON.stringify(appendColdStart(readColdStarts(), sample)));
}
