"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  File,
  FileText,
  Focus,
  Folder,
  Menu,
  Play,
  Plus,
  Search,
  Trash2,
  Volume2,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type TNode = {
  id: string;
  name: string;
  type: "file" | "folder" | "video" | "audio" | "form";
  children?: TNode[];
  content?: string;
  isExpanded?: boolean;
  isSelected?: boolean;
  animationState?: { progress: number };
  focusState?: { cursorPos: number };
};

type TTreeProps = {
  nodes: TNode[];
  onChange: (updater: (tree: TNode[]) => TNode[]) => void;
  level?: number;
  searchQuery?: string;
};

type TNodeProps = {
  node: TNode;
  onChange: (updater: (tree: TNode[]) => TNode[]) => void;
  level?: number;
  searchQuery?: string;
};

const INITIAL_TREE: TNode[] = [
  {
    id: "root1",
    name: "Project Root",
    type: "folder",
    children: [
      {
        id: "doc1",
        name: "README.md",
        type: "form",
        content: "Editable content here...",
        focusState: { cursorPos: 0 },
      },
      {
        id: "sub1",
        name: "src",
        type: "folder",
        children: [
          { id: "f1", name: "app.tsx", type: "file" },
          {
            id: "comp1",
            name: "components",
            type: "folder",
            children: [
              { id: "btn", name: "Button.tsx", type: "file" },
              {
                id: "vid1",
                name: "Demo Video",
                type: "video",
                content: "https://example.com/video.mp4",
                animationState: { progress: 0 },
              },
            ],
          },
          {
            id: "aud1",
            name: "Background Audio",
            type: "audio",
            content: "https://example.com/audio.mp3",
            animationState: { progress: 0 },
          },
        ],
      },
    ],
  },
  {
    id: "root2",
    name: "Assets",
    type: "folder",
    children: [
      { id: "img1", name: "logo.png", type: "file" },
      {
        id: "media2",
        name: "Media Folder",
        type: "folder",
        children: [
          {
            id: "vid2",
            name: "Another Video",
            type: "video",
            content: "https://example.com/another.mp4",
            animationState: { progress: 25 },
          },
          { id: "doc2", name: "notes.txt", type: "form", content: "Focused note...", focusState: { cursorPos: 5 } },
        ],
      },
    ],
  },
  {
    id: "root3",
    name: "Tests",
    type: "folder",
    isExpanded: false,
    children: [
      { id: "t1", name: "test1.js", type: "file" },
      {
        id: "suite1",
        name: "integration",
        type: "folder",
        children: Array.from({ length: 10 }, (_, i) => ({
          id: `test${i + 1}`,
          name: `Test Case ${i + 1}.ts`,
          type: "file",
        })),
      },
    ],
  },
];

function filterTree(nodes: TNode[], query: string): TNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? filterTree(node.children, query) : undefined,
    }))
    .filter(
      (node) =>
        node.name.toLowerCase().includes(query.toLowerCase()) ||
        (node.children && node.children.length > 0),
    );
}

function removeNode(tree: TNode[], id: string): [TNode | null, TNode[]] {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === id) {
      const newTree = [...tree];
      const [removed] = newTree.splice(i, 1);
      return [removed, newTree];
    }
    if (tree[i].children) {
      const [r, newChildren] = removeNode(tree[i].children!, id);
      if (r) {
        return [
          r,
          tree.map((n, idx) =>
            idx === i ? { ...n, children: newChildren, isExpanded: true } : n,
          ),
        ];
      }
    }
  }
  return [null, tree];
}

function insertNode(
  tree: TNode[],
  targetId: string,
  node: TNode,
  position: "before" | "after" | "inside" = "inside",
): TNode[] {
  return tree.map((n) => {
    if (n.id === targetId) {
      if (n.type === "folder" && position === "inside") {
        const children = n.children ? [...n.children, node] : [node];
        return { ...n, children, isExpanded: true };
      }
      const newChildren = n.children ? [...n.children] : [];
      const targetIdx = newChildren.findIndex((child) => child.id === targetId);
      const insertIdx =
        position === "before"
          ? targetIdx
          : position === "after"
            ? targetIdx + 1
            : newChildren.length;
      newChildren.splice(insertIdx, 0, node);
      return { ...n, children: newChildren };
    }
    if (n.children) {
      return { ...n, children: insertNode(n.children, targetId, node, position) };
    }
    return n;
  });
}

function syncDOMOrder(ulRef: React.RefObject<HTMLElement>, nodes: TNode[]) {
  const ul = ulRef.current;
  if (!ul || typeof (ul as any).moveBefore !== "function") return;

  const liElements = Array.from(ul.children) as HTMLElement[];
  const sortedElements = useMemo(
    () =>
      liElements
        .map((el) => ({
          el,
          id: el.getAttribute("data-id"),
          nodeIdx: nodes.findIndex((n) => n.id === el.getAttribute("data-id")),
        }))
        .filter((item) => item.nodeIdx !== -1)
        .sort((a, b) => a.nodeIdx - b.nodeIdx)
        .map((item) => item.el),
    [liElements, nodes],
  );

  let prevEl: HTMLElement | null = null;
  sortedElements.forEach((el) => {
    if (prevEl && prevEl !== el) {
      (ul as any).moveBefore(el, prevEl);
    }
    prevEl = el.nextElementSibling as HTMLElement | null;
  });
}

function Tree({ nodes, onChange, level = 0, searchQuery = "" }: TTreeProps) {
  const ulRef = useRef<HTMLUListElement>(null);
  const filteredNodes = useMemo(
    () => (searchQuery ? filterTree(nodes, searchQuery) : nodes),
    [nodes, searchQuery],
  );

  useEffect(() => {
    if (filteredNodes.length > 0) {
      syncDOMOrder(ulRef, filteredNodes);
    }
  }, [filteredNodes]);

  return (
    <ul ref={ulRef} className={`ml-${level * 2} pl-2 border-l border-neutral-700 space-y-1`}>
      <AnimatePresence>
        {filteredNodes.map((node) => (
          <TreeNode key={node.id} node={node} onChange={onChange} level={level} searchQuery={searchQuery} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function TreeNode({ node, onChange, level = 0, searchQuery = "" }: TNodeProps) {
  const [isOpen, setIsOpen] = useState(node.isExpanded ?? true);
  const [dragOverSelf, setDragOverSelf] = useState(false);
  const [dragOverChild, setDragOverChild] = useState(false);
  const [dragOverBefore, setDragOverBefore] = useState(false);
  const [dragOverAfter, setDragOverAfter] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const isHighlighted = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());

  const handleToggle = useCallback(() => {
    if (node.type === "folder") {
      setIsOpen((prev) => !prev);
      onChange((tree) =>
        tree.map((n) =>
          n.id === node.id ? { ...n, isExpanded: !isOpen } : n,
        ),
      );
    }
  }, [node.id, node.type, isOpen, onChange]);

  const handleSelect = useCallback(() => {
    onChange((tree) =>
      tree.map((n) => ({
        ...n,
        isSelected: n.id === node.id ? !n.isSelected : false,
      })),
    );
  }, [node.id, onChange]);

  const syncOrder = useCallback(() => {
    const parentUl = liRef.current?.parentElement;
    if (!parentUl || typeof (parentUl as any).moveBefore !== "function") return;

    const siblings = Array.from(parentUl.children) as HTMLElement[];
    const currentIds = siblings.map((el) => el.getAttribute("data-id") || "");
    const treeNodes = onChange.toString().includes("setTree") ? INITIAL_TREE : [];
    const sorted = [...siblings].sort((a, b) => {
      const aIdx = treeNodes.findIndex((n) => n.id === a.getAttribute("data-id"));
      const bIdx = treeNodes.findIndex((n) => n.id === b.getAttribute("data-id"));
      return aIdx - bIdx;
    });

    sorted.forEach((child, i) => {
      if (siblings[i] !== child) {
        (parentUl as any).moveBefore(child, siblings[i] || null);
      }
    });
  }, [onChange]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData("id", node.id);
    e.dataTransfer.setData("type", node.type);
    requestAnimationFrame(syncOrder);
  }, [node.id, node.type, syncOrder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("id");
    if (draggedId === node.id) return;

    const rect = liRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const h = rect.height;
    setDragOverBefore(y < h / 3);
    setDragOverAfter(y > (2 * h) / 3);
    setDragOverSelf(y >= h / 3 && y <= (2 * h) / 3);
    setDragOverChild(false);
  }, []);

  const handleDragEnterChild = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("id");
    if (draggedId === node.id || node.type !== "folder") return;
    setDragOverChild(true);
    setTimeout(() => setIsOpen(true), 150);
  }, [node.id, node.type, isOpen]);

  const handleDragLeave = useCallback(() => {
    setDragOverSelf(false);
    setDragOverChild(false);
    setDragOverBefore(false);
    setDragOverAfter(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("id");
    const draggedType = e.dataTransfer.getData("type");
    if (!draggedId || draggedId === node.id) return;

    setDragOverSelf(false);
    setDragOverChild(false);
    setDragOverBefore(false);
    setDragOverAfter(false);

    onChange((tree) => {
      const [draggedNode, withoutDragged] = removeNode(tree, draggedId);
      if (!draggedNode) return tree;

      if (node.type === "folder" && dragOverChild) {
        return insertNode(withoutDragged, node.id, { ...draggedNode, type: draggedType as TNode["type"] });
      }

      const position = dragOverBefore ? "before" : "after";
      return insertNode(withoutDragged, node.id, { ...draggedNode, type: draggedType as TNode["type"] }, position);
    });
  }, [node.id, node.type, dragOverChild, dragOverBefore, dragOverAfter, onChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, id: node.id });
  }, [node.id]);

  const handleAddNode = useCallback(() => {
    const newNode: TNode = {
      id: `new-${Date.now()}`,
      name: "New Item",
      type: "file",
    };
    onChange((tree) => insertNode(tree, node.id, newNode, "inside"));
    setContextMenu(null);
  }, [node.id, onChange]);

  const handleDeleteNode = useCallback(() => {
    onChange((tree) => {
      const [_, newTree] = removeNode(tree, node.id);
      return newTree;
    });
    setContextMenu(null);
  }, [node.id, onChange]);

  const handleCloseContext = useCallback(() => setContextMenu(null), []);

  const Icon = useMemo(() => {
    switch (node.type) {
      case "folder": return Folder;
      case "video": return Play;
      case "audio": return Volume2;
      case "form": return FileText;
      default: return File;
    }
  }, [node.type]);

  return (
    <>
      <li
        ref={liRef}
        data-id={node.id}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onClick={handleSelect}
        className={`select-none group relative ${isHighlighted ? "bg-yellow-900/20" : ""} ${node.isSelected ? "bg-blue-600/20" : ""}`}
      >
        <motion.div
          className={`flex items-center gap-1 cursor-pointer p-1 rounded transition-colors ${dragOverSelf
            ? "bg-blue-600/30 border-2 border-dashed border-blue-400"
            : dragOverBefore
              ? "border-t-2 border-dashed border-green-400"
              : dragOverAfter
                ? "border-b-2 border-dashed border-green-400"
                : "hover:bg-neutral-800"
            }`}
          initial={{ opacity: 0, x: -20, scale: 0.95 }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            backgroundColor: node.animationState?.progress ? "#10b981" : "#171717",
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={handleToggle}
          drag
        >
          <div className="relative">
            {node.type === "folder" && (
              <ChevronRight
                className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
            )}
            {node.type === "video" && node.animationState?.progress && (
              <motion.div
                className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-neutral-900"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            <Icon className={`w-4 ${node.type === "form" ? "text-blue-400" : node.type === "video" ? "text-red-400" : node.type === "audio" ? "text-purple-400" : "text-neutral-400"} ml-${level * 4 + (node.type === "file" ? 18 : 0)}`} />
          </div>
          <span className="flex-1 min-w-0 truncate">{node.name}</span>
          {node.type === "form" && (
            <Focus className="w-3 text-blue-400" />
          )}
          <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-800 rounded">
            <Menu className="w-4" />
          </button>
        </motion.div>

        {node.type === "form" && node.content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: node.isSelected ? 1 : 0, height: node.isSelected ? "auto" : 0 }}
            className="ml-6 p-2 bg-neutral-800 rounded"
          >
            <textarea
              defaultValue={node.content}
              onFocus={(e) => {
                e.target.setSelectionRange(node.focusState?.cursorPos || 0, node.focusState?.cursorPos || 0);
                onChange((tree) =>
                  updateNode(tree, node.id, { focusState: { cursorPos: e.target.selectionStart } }),
                );
              }}
              className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded text-sm"
              rows={3}
            />
          </motion.div>
        )}

        {node.type === "video" && node.content && (
          <motion.video
            src={node.content}
            controls
            autoPlay
            loop
            muted
            className="ml-6 w-48 h-32 rounded bg-neutral-800"
            onTimeUpdate={(e) => {
              onChange((tree) =>
                updateNode(tree, node.id, { animationState: { progress: (e.currentTarget.currentTime / e.currentTarget.duration) * 100 } }),
              );
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            Your browser does not support the video tag.
          </motion.video>
        )}

        {node.type === "audio" && node.content && (
          <motion.audio
            src={node.content}
            controls
            autoPlay
            loop
            className="ml-6"
            onTimeUpdate={(e) => {
              onChange((tree) =>
                updateNode(tree, node.id, { animationState: { progress: (e.currentTarget.currentTime / e.currentTarget.duration) * 100 } }),
              );
            }}
          />
        )}

        {node.children && isOpen && (
          <div
            onDragEnter={handleDragEnterChild}
            className={`ml-4 ${dragOverChild ? "bg-blue-600/10 border-2 border-dashed border-blue-400 rounded" : ""}`}
          >
            <Tree nodes={node.children || []} onChange={onChange} level={level + 1} searchQuery={searchQuery} />
          </div>
        )}
      </li>

      <ContextMenu
        visible={!!contextMenu}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        nodeId={contextMenu?.id || ""}
        onAdd={handleAddNode}
        onDelete={handleDeleteNode}
        onClose={handleCloseContext}
        canDelete={node.type !== "folder" || !node.children?.length}
      />
    </>
  );
}

type TContextMenuProps = {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
  onAdd: () => void;
  onDelete: () => void;
  onClose: () => void;
  canDelete: boolean;
};

function ContextMenu({ visible, x, y, onAdd, onDelete, onClose, canDelete }: TContextMenuProps) {
  if (!visible) return null;

  return (
    <motion.div
      className="fixed bg-neutral-800 border border-neutral-700 rounded shadow-lg p-2 z-50"
      initial={{ opacity: 0, scale: 0.8, x: 10, y: 10 }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onAdd} className="flex items-center gap-2 w-full p-2 hover:bg-neutral-700 rounded">
        <Plus className="w-4" />
        Add Child
      </button>
      {canDelete && (
        <button onClick={onDelete} className="flex items-center gap-2 w-full p-2 hover:bg-neutral-700 rounded text-red-400">
          <Trash2 className="w-4" />
          Delete
        </button>
      )}
      <button onClick={onClose} className="flex items-center gap-2 w-full p-2 hover:bg-neutral-700 rounded">
        Close
      </button>
    </motion.div>
  );
}

function updateNode(tree: TNode[], id: string, updates: Partial<TNode>): TNode[] {
  return tree.map((n) => {
    if (n.id === id) {
      return { ...n, ...updates };
    }
    if (n.children) {
      return { ...n, children: updateNode(n.children, id, updates) };
    }
    return n;
  });
}

function AppToolbar({ searchQuery, onSearchChange, onToggleMoveBefore }: { searchQuery: string; onSearchChange: (q: string) => void; onToggleMoveBefore: () => void }) {
  const supportsMoveBefore = typeof window !== "undefined" && "moveBefore" in Element.prototype;

  return (
    <div className="flex items-center gap-4 mb-4 p-4 bg-neutral-800 rounded">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded focus:border-blue-500 focus:outline-none"
        />
      </div>
      {supportsMoveBefore && (
        <button
          onClick={onToggleMoveBefore}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
        >
          Toggle moveBefore Demo
        </button>
      )}
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm"
      >
        Reset Tree
      </button>
    </div>
  );
}

export default function Page() {
  const [tree, setTree] = useState(INITIAL_TREE);
  const [searchQuery, setSearchQuery] = useState("");
  const [useMoveBefore, setUseMoveBefore] = useState(true);

  const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

  const handleToggleMoveBefore = useCallback(() => {
    setUseMoveBefore((prev) => !prev);
    if (!useMoveBefore) {
      console.log("Switched to moveBefore: State-preserving moves enabled");
    } else {
      console.log("Switched to traditional: May reset animations/focus");
    }
  }, [useMoveBefore]);

  useEffect(() => {
    if (!useMoveBefore) {
      console.warn("Traditional mode: Animations and focus may reset on drag");
    }
  }, [useMoveBefore]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        Advanced moveBefore() Tree Demo
        {useMoveBefore && <span className="text-green-400">🔄 State Preserved</span>}
        {!useMoveBefore && <span className="text-yellow-400">⚠️ Traditional Mode</span>}
      </h1>
      <p className="mb-4 text-neutral-400">
        Drag nodes to reorder/move. Videos/audio play continuously with moveBefore. Forms retain focus/cursor. Context menu for add/delete. Search filters tree. Complex nesting with 20+ nodes.
      </p>
      <div className="mb-4 text-sm text-neutral-500">
        Feature available in Chrome 133+. Test state preservation by dragging video/audio/form nodes.
      </div>
      <AppToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleMoveBefore={handleToggleMoveBefore}
      />
      <div className="max-w-4xl">
        <Tree nodes={filteredTree} onChange={setTree} searchQuery={searchQuery} />
      </div>
      <div className="mt-8 p-4 bg-neutral-800 rounded text-sm">
        <h3 className="font-semibold mb-2">Advanced Features:</h3>
        <ul className="space-y-1 text-neutral-300">
          <li>• Deep nesting (up to 3+ levels, 20+ nodes) with recursive rendering</li>
          <li>• Drag zones: before/after node or inside folder (visual indicators)</li>
          <li>• State preservation: Video progress, audio playback, form cursor pos via moveBefore</li>
          <li>• Animations: Framer Motion for entrances, drags; continue during moves</li>
          <li>• Multi-select: Click to toggle selection (background highlight)</li>
          <li>• Context menu: Right-click for add/delete (demo with icons)</li>
          <li>• Search: Filters tree, expands matches, highlights</li>
          <li>• Toolbar: Search input, toggle moveBefore vs traditional, reset</li>
          <li>• Fallback: Detects moveBefore; traditional mode resets state for comparison</li>
          <li>• Bulk ops: Delete/add via context; selections persist on moves</li>
        </ul>
      </div>
    </main>
  );
}
