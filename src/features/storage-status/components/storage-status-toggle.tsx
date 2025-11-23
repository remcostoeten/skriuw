import { Database } from "lucide-react";

import { Button } from "@/shared/ui/button";

interface StorageStatusToggleProps {
	onClick: () => void
}

export function StorageStatusToggle({ onClick }: StorageStatusToggleProps) {
	return (
		<Button
			variant="outline"
			size="icon"
			onClick={onClick}
			className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg"
			title="Storage Status"
		>
			<Database className="h-5 w-5" />
		</Button>
	);
}



