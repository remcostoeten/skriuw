import {
	ProcessNode,
	DecisionNode,
	TerminalNode,
	DataNode,
	CircleNode,
	SubroutineNode,
	CylinderNode,
	HexagonNode,
	NoteNode,
} from "./nodes";

export const nodeTypes = {
	process: ProcessNode,
	decision: DecisionNode,
	terminal: TerminalNode,
	data: DataNode,
	circle: CircleNode,
	subroutine: SubroutineNode,
	cylinder: CylinderNode,
	hexagon: HexagonNode,
	note: NoteNode,
};
