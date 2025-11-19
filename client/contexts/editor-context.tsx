import { createContext, useContext, useState, ReactNode } from 'react';
import { BlockNoteEditor } from '@blocknote/core';

type Ctx = {
  editor: BlockNoteEditor | null;
  isReadOnly: boolean;
  setEditor: (editor: BlockNoteEditor | null) => void;
  setIsReadOnly: (readOnly: boolean) => void;
  toggleReadOnly: () => void;
};

const EditorContext = createContext<Ctx | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const toggleReadOnly = () => {
    setIsReadOnly((prev) => !prev);
  };

  return (
    <EditorContext.Provider
      value={{
        editor,
        isReadOnly,
        setEditor,
        setIsReadOnly,
        toggleReadOnly,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext() {
  return useContext(EditorContext);
}

