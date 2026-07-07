import { createContext, useContext } from "react";

interface DiagramContextValue {
	onLabelChange: (id: string, label: string) => void;
}

export const DiagramContext = createContext<DiagramContextValue>({
	onLabelChange: () => {},
});

export function useDiagramContext() {
	return useContext(DiagramContext);
}
