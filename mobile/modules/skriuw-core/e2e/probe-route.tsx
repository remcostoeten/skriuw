import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { skriuwCore } from "../modules/skriuw-core";

const PROBE_NOTE_ID = "skriuw-core-probe-note";
const PROBE_TITLE = "Written through the native core";
const MARKER = "SKRIUW_CORE_PROBE";

async function runProbe(): Promise<string> {
  const protocolVersion = await skriuwCore.protocolVersion();
  const { databasePath } = await skriuwCore.open();
  const snapshot = JSON.parse(await skriuwCore.bootstrap()) as {
    nodes: { id: string; title?: string }[];
  };
  const existing = snapshot.nodes.find((node) => node.id === PROBE_NOTE_ID);

  if (existing) {
    const document = JSON.parse(await skriuwCore.loadDocument(PROBE_NOTE_ID)) as { noteId: string };
    return `read-back title=${JSON.stringify(existing.title)} document=${document.noteId} database=${databasePath}`;
  }

  await skriuwCore.submitOperations(
    JSON.stringify([
      {
        protocolVersion,
        operation: {
          type: "create_note",
          id: PROBE_NOTE_ID,
          title: PROBE_TITLE,
          placement: { parentId: null, position: { type: "last" } },
          documentJson: { type: "doc", content: [] },
          markdown: "",
          at: Date.now(),
        },
      },
    ]),
  );
  return `created protocol=${protocolVersion} database=${databasePath}`;
}

export default function SkriuwCoreProbe() {
  const [outcome, setOutcome] = useState("running");

  useEffect(() => {
    runProbe()
      .then((result) => `${MARKER} ${result}`)
      .catch((error: unknown) => `${MARKER} failed ${String(error)}`)
      .then((line) => {
        console.log(line);
        setOutcome(line);
      });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text accessibilityLabel="skriuw-core-probe">{outcome}</Text>
    </View>
  );
}
