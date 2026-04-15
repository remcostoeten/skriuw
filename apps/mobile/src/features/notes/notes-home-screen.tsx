import { useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDate, getNotePreview, getNoteTitle } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function NotesHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createFolder, createNote, updateNote, deleteNote } = useWorkspace();
  const [query, setQuery] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "inbox">("all");

  async function openNewNote() {
    const note = await createNote(activeFolderId === "all" || activeFolderId === "inbox" ? null : activeFolderId);
    router.push(`/notes/${note.id}`);
  }

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const notes = [...workspace.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const folderName = workspace.folders.find((folder) => folder.id === note.parentId)?.name ?? "";
        const noteTitle = getNoteTitle(note.name, note.content);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          `${noteTitle} ${note.content} ${folderName}`.toLowerCase().includes(normalizedQuery);

        if (!matchesQuery) {
          return false;
        }

        if (activeFolderId === "all") {
          return true;
        }

        if (activeFolderId === "inbox") {
          return note.parentId === null;
        }

        return note.parentId === activeFolderId;
      }),
    [activeFolderId, normalizedQuery, notes, workspace.folders],
  );

  const inboxCount = workspace.notes.filter((note) => note.parentId === null).length;
  const activeLabel =
    activeFolderId === "all"
      ? "All Notes"
      : activeFolderId === "inbox"
        ? "Inbox"
        : workspace.folders.find((folder) => folder.id === activeFolderId)?.name ?? "Folder";

  return (
    <View style={commonStyles.screen}>
      <Stack.Screen
        options={{
          title: "Notes",
          headerRight: () => (
            <Pressable onPress={() => void openNewNote()}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "700" }}>New</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView style={commonStyles.screen} contentContainerStyle={[commonStyles.scrollContent, { paddingBottom: 120 }]}>
        <View style={commonStyles.splitLayout}>
          <View style={commonStyles.splitSidebar}>
            <View style={[commonStyles.card, { gap: 14 }]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search notes"
                placeholderTextColor={palette.textSoft}
                style={commonStyles.inputCompact}
              />
              <Pressable style={commonStyles.button} onPress={() => void openNewNote()}>
                <Text style={commonStyles.buttonLabel}>New note</Text>
              </Pressable>
              <Pressable
                style={commonStyles.buttonSecondary}
                onPress={async () => {
                  const folder = await createFolder();
                  setActiveFolderId(folder.id);
                }}
              >
                <Text style={commonStyles.buttonLabelSecondary}>New folder</Text>
              </Pressable>
            </View>

            <View style={commonStyles.card}>
              <Text style={commonStyles.sectionTitle}>Browse</Text>
              <View style={{ gap: 10 }}>
                <SidebarItem
                  active={activeFolderId === "all"}
                  label="All Notes"
                  count={workspace.notes.length}
                  onPress={() => setActiveFolderId("all")}
                />
                <SidebarItem
                  active={activeFolderId === "inbox"}
                  label="Inbox"
                  count={inboxCount}
                  onPress={() => setActiveFolderId("inbox")}
                />
              </View>
            </View>

            <View style={commonStyles.card}>
              <View style={commonStyles.sectionHeader}>
                <Text style={commonStyles.sectionTitle}>Folders</Text>
                <Text style={commonStyles.caption}>{workspace.folders.length}</Text>
              </View>
              {workspace.folders.length === 0 ? (
                <Text style={commonStyles.subtitle}>Create a folder to file notes out of Inbox.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {workspace.folders.map((folder) => {
                    const folderCount = workspace.notes.filter((note) => note.parentId === folder.id).length;

                    return (
                      <SidebarItem
                        key={folder.id}
                        active={activeFolderId === folder.id}
                        label={folder.name}
                        count={folderCount}
                        onPress={() => setActiveFolderId(folder.id)}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          <View style={commonStyles.splitMain}>
            {filteredNotes.length === 0 ? (
              <View style={[commonStyles.card, commonStyles.emptyStateCard]}>
                <Text style={commonStyles.emptyStateTitle}>
                  {normalizedQuery.length > 0 ? "No matching notes" : "No notes yet"}
                </Text>
                <Text style={commonStyles.emptyStateBody}>
                  {normalizedQuery.length > 0
                    ? "Try a different search or switch folders."
                    : `Create a note in ${activeLabel} and it will appear here.`}
                </Text>
                <Pressable style={commonStyles.button} onPress={() => void openNewNote()}>
                  <Text style={commonStyles.buttonLabel}>Create note</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[commonStyles.card, { paddingVertical: 0, gap: 0 }]}>
                <View style={[commonStyles.sectionHeader, { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 }]}>
                  <Text style={commonStyles.listHeaderTitle}>{activeLabel}</Text>
                  <Text style={commonStyles.listHeaderMeta}>
                    {filteredNotes.length} note{filteredNotes.length === 1 ? "" : "s"}
                  </Text>
                </View>

                {filteredNotes.map((note, index) => {
                  const folderName = workspace.folders.find((folder) => folder.id === note.parentId)?.name ?? "Inbox";
                  const noteActions = [
                    {
                      text: "Open",
                      onPress: () => router.push(`/notes/${note.id}`),
                    },
                    ...(note.parentId !== null
                      ? [
                          {
                            text: "Move to Inbox",
                            onPress: () => {
                              void updateNote(note.id, { parentId: null });
                            },
                          },
                        ]
                      : []),
                    {
                      text: "Delete",
                      style: "destructive" as const,
                      onPress: () => {
                        void deleteNote(note.id);
                      },
                    },
                    { text: "Cancel", style: "cancel" as const },
                  ];

                  return (
                    <Pressable
                      key={note.id}
                      style={({ pressed }) => [
                        commonStyles.noteRow,
                        index > 0 && commonStyles.noteRowBorder,
                        pressed && { backgroundColor: palette.surfaceRaised },
                      ]}
                      onPress={() => router.push(`/notes/${note.id}`)}
                      onLongPress={() => Alert.alert(getNoteTitle(note.name, note.content), undefined, noteActions)}
                    >
                      <Text style={commonStyles.noteMeta}>{folderName}</Text>
                      <View style={commonStyles.noteTitleRow}>
                        <Text numberOfLines={1} style={commonStyles.noteTitleCompact}>
                          {getNoteTitle(note.name, note.content)}
                        </Text>
                        <Text style={commonStyles.noteDateCompact}>{formatDate(note.updatedAt)}</Text>
                      </View>
                      <Text numberOfLines={2} style={commonStyles.notePreviewCompact}>
                        {getNotePreview(note.content)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Pressable style={commonStyles.fab} onPress={() => void openNewNote()}>
        <Text style={commonStyles.fabLabel}>New note</Text>
      </Pressable>
    </View>
  );
}

function SidebarItem({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        commonStyles.sidebarNavItem,
        active && commonStyles.sidebarNavItemActive,
        pressed && { opacity: 0.9 },
      ]}
      onPress={onPress}
    >
      <Text style={[commonStyles.sidebarNavLabel, active && commonStyles.sidebarNavLabelActive]}>{label}</Text>
      <Text style={commonStyles.sidebarNavCount}>{count}</Text>
    </Pressable>
  );
}
