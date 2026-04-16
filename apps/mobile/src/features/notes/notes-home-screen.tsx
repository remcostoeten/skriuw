import { useEffect, useMemo, useRef, useState } from "react";
import { Stack, useRouter } from "expo-router";
import {
  Animated,
  Easing,
  FlatList,
  Image,
  ListRenderItemInfo,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileNote } from "@/src/core/workspace-types";
import { NoteActionsSheet } from "@/src/features/notes/note-actions-sheet";
import { NoteListItem } from "@/src/features/notes/note-list-item";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { getNoteTitle } from "@/src/lib/workspace-format";
import { BottomToolbar } from "@/src/ui/bottom-toolbar";
import { commonStyles } from "@/src/ui/styles";

export function NotesHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createFolder, createNote, updateNote, deleteNote, deleteFolder } = useWorkspace();
  const [query, setQuery] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "inbox">("all");
  const [selectedNote, setSelectedNote] = useState<MobileNote | null>(null);
  const [sheetMode, setSheetMode] = useState<"main" | "move">("main");
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const menuProgress = useRef(new Animated.Value(0)).current;

  async function openNewNote() {
    const note = await createNote(activeFolderId === "all" || activeFolderId === "inbox" ? null : activeFolderId);
    router.push(`/notes/${note.id}`);
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
  const isSearching = searchFocused || normalizedQuery.length > 0;

  function openNoteSheet(note: MobileNote, mode: "main" | "move" = "main") {
    void Haptics.selectionAsync();
    setSelectedNote(note);
    setSheetMode(mode);
  }

  function openMenu() {
    void Haptics.selectionAsync();
    setMenuVisible(true);
  }

  function enterSearch() {
    setSearchFocused(true);
  }

  function cancelSearch() {
    setQuery("");
    setSearchFocused(false);
  }

  function closeMenu() {
    Animated.timing(menuProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenuVisible(false);
      }
    });
  }

  async function createFolderAndMove(note: MobileNote) {
    const folder = await createFolder();
    await updateNote(note.id, { parentId: folder.id });
  }

  useEffect(() => {
    if (!menuVisible) {
      menuProgress.setValue(0);
      return;
    }

    Animated.timing(menuProgress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuProgress, menuVisible]);

  function renderHeader() {
    return (
      <View style={commonStyles.homeHeader}>
        {!isSearching ? (
          <View style={commonStyles.brandRow}>
            <Image source={require("../../../assets/splash-icon.png")} style={commonStyles.brandLogo} />
            <View style={commonStyles.homeBrandCopy}>
              <Text style={commonStyles.brandTitle}>Skriuw</Text>
              <Text style={commonStyles.brandSubtitle}>Fast capture. Clean browse. No clutter.</Text>
            </View>
          </View>
        ) : (
          <View style={commonStyles.searchModeHeader}>
            <Text style={commonStyles.searchModeTitle}>Search</Text>
            <Text style={commonStyles.searchModeMeta}>Across note titles, content, and folders</Text>
          </View>
        )}

        <View style={commonStyles.homeSectionRow}>
          <Text style={commonStyles.homeSectionTitle}>{isSearching ? "Results" : activeLabel}</Text>
          <Text style={commonStyles.homeSectionMeta}>
            {filteredNotes.length} note{filteredNotes.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
    );
  }

  function renderNoteItem({ item, index }: ListRenderItemInfo<MobileNote>) {
    const folderName = workspace.folders.find((folder) => folder.id === item.parentId)?.name ?? "Inbox";

    return (
      <NoteListItem
        note={item}
        folderName={folderName}
        bordered={index > 0}
        index={index}
        onOpen={() => router.push(`/notes/${item.id}`)}
        onMove={() => openNoteSheet(item, "move")}
        onDelete={() => {
          void deleteNote(item.id);
        }}
        onShowActions={() => openNoteSheet(item, "main")}
      />
    );
  }

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={commonStyles.screen} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <FlatList
        style={commonStyles.screen}
        contentContainerStyle={[commonStyles.scrollContent, { paddingBottom: 120 }]}
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
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
              <Text style={commonStyles.buttonLabel}>New note</Text>
            </Pressable>
          </View>
        }
      />

      <BottomToolbar
        actions={[
          { label: "Browse", onPress: openMenu },
          { label: "New note", onPress: () => void openNewNote(), variant: "primary" },
        ]}
        searchPlaceholder={`Search in ${activeLabel}`}
        searchValue={query}
        onSearchChange={setQuery}
        searchActive={isSearching}
        onSearchOpen={enterSearch}
        onSearchCancel={cancelSearch}
      />

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={closeMenu}>
        <View style={commonStyles.drawerOverlay}>
          <Animated.View
            style={[
              commonStyles.drawerBackdrop,
              {
                opacity: menuProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          >
            <Pressable style={{ flex: 1 }} onPress={closeMenu} />
          </Animated.View>
          <Animated.View
            style={[
              commonStyles.drawerPanel,
              {
                transform: [
                  {
                    translateX: menuProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-320, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={commonStyles.drawerHeader}>
              <View style={commonStyles.brandRow}>
                <Image source={require("../../../assets/splash-icon.png")} style={commonStyles.brandLogo} />
                <View style={commonStyles.homeBrandCopy}>
                  <Text style={commonStyles.brandTitle}>Skriuw</Text>
                  <Text style={commonStyles.brandSubtitle}>Browse notes and folders</Text>
                </View>
              </View>
              <Pressable style={commonStyles.iconButton} onPress={closeMenu}>
                <Text style={commonStyles.iconButtonLabel}>×</Text>
              </Pressable>
            </View>

            <View style={commonStyles.sidebarGroup}>
              <Text style={commonStyles.sidebarGroupLabel}>Browse</Text>
              <View style={commonStyles.sidebarList}>
                <SidebarItem
                  active={activeFolderId === "all"}
                  label="All Notes"
                  count={workspace.notes.length}
                  onPress={() => {
                    setActiveFolderId("all");
                    closeMenu();
                  }}
                />
                <SidebarItem
                  active={activeFolderId === "inbox"}
                  label="Inbox"
                  count={inboxCount}
                  onPress={() => {
                    setActiveFolderId("inbox");
                    closeMenu();
                  }}
                />
              </View>
            </View>

            <View style={commonStyles.sidebarGroup}>
              <View style={commonStyles.sectionHeader}>
                <Text style={commonStyles.sidebarGroupLabel}>Folders</Text>
                <Pressable
                  style={commonStyles.inlineAction}
                  onPress={async () => {
                    const folder = await createFolder();
                    setActiveFolderId(folder.id);
                    closeMenu();
                  }}
                >
                  <Text style={commonStyles.inlineActionLabel}>New</Text>
                </Pressable>
              </View>
              {workspace.folders.length === 0 ? (
                <Text style={commonStyles.subtitle}>Create a folder to file notes out of Inbox.</Text>
              ) : (
                <View style={commonStyles.sidebarList}>
                  {workspace.folders.map((folder) => {
                    const folderCount = workspace.notes.filter((note) => note.parentId === folder.id).length;

                    return (
                      <SidebarItem
                        key={folder.id}
                        active={activeFolderId === folder.id}
                        label={folder.name}
                        count={folderCount}
                        onPress={() => {
                          setActiveFolderId(folder.id);
                          closeMenu();
                        }}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <NoteActionsSheet
        visible={selectedNote !== null}
        note={selectedNote}
        folders={workspace.folders}
        initialMode={sheetMode}
        onClose={() => setSelectedNote(null)}
        onOpen={
          selectedNote
            ? () => {
                router.push(`/notes/${selectedNote.id}`);
              }
            : undefined
        }
        onMove={(parentId) => {
          if (!selectedNote) {
            return;
          }

          void updateNote(selectedNote.id, { parentId });
        }}
        onCreateFolder={() => {
          if (!selectedNote) {
            return;
          }

          void createFolderAndMove(selectedNote);
        }}
        onDelete={() => {
          if (!selectedNote) {
            return;
          }

          void deleteNote(selectedNote.id);
        }}
        onDeleteCurrentFolder={(folderId) => {
          void deleteFolder(folderId);
        }}
      />
    </SafeAreaView>
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
