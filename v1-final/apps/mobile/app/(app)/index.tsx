import { SafeAreaView } from "react-native-safe-area-context";
import { WorkspaceList } from "@/components/WorkspaceList";
import { useTheme } from "@/theme/theme-provider";

export default function NotesListScreen() {
	const { theme } = useTheme();

	return (
		<SafeAreaView
			edges={["left", "right"]}
			style={{ flex: 1, backgroundColor: theme.background }}
		>
			<WorkspaceList folderId={null} />
		</SafeAreaView>
	);
}
