import { useLayoutEffect } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WorkspaceList } from "@/components/WorkspaceList";
import { useFolders } from "@/query/notes";
import { useTheme } from "@/theme/theme-provider";

export default function FolderScreen() {
	const { folderId } = useLocalSearchParams<{ folderId: string }>();
	const navigation = useNavigation();
	const { theme } = useTheme();
	const { data: folders } = useFolders();

	const folder = folders?.find((f) => f.id === folderId);

	useLayoutEffect(() => {
		navigation.setOptions({ title: folder?.name ?? "Folder" });
	}, [navigation, folder?.name]);

	return (
		<SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
			<WorkspaceList folderId={folderId} />
		</SafeAreaView>
	);
}
