'use client';

import { useState } from 'react';

type CommandType = 'seed' | 'move';

interface SeedOptions {
  title: string;
  date: string;
  contentFile: string;
  content: string;
  contentSource: 'file' | 'content';
  pinned: boolean;
  folderId: string;
  position: string;
  taskIds: string;
}

interface MoveOptions {
  noteId: string;
  folderId: string;
  position: string;
  useEnd: boolean;
}

export function SeederCommandBuilder() {
  const [commandType, setCommandType] = useState<CommandType>('seed');
  const [seedOptions, setSeedOptions] = useState<SeedOptions>({
    title: '',
    date: '',
    contentFile: '',
    content: '',
    contentSource: 'file',
    pinned: false,
    folderId: '',
    position: '',
    taskIds: ''
  });
  const [moveOptions, setMoveOptions] = useState<MoveOptions>({
    noteId: '',
    folderId: '',
    position: '',
    useEnd: false
  });

  const buildSeedCommand = (): string => {
    let cmd = 'bun run tools/seeder/src/index.ts seed';
    
    if (seedOptions.title) {
      cmd += ` \\\n  --title "${seedOptions.title}"`;
    }
    
    if (seedOptions.date) {
      cmd += ` \\\n  --date "${seedOptions.date}"`;
    }
    
    if (seedOptions.contentSource === 'file' && seedOptions.contentFile) {
      cmd += ` \\\n  --content-file "${seedOptions.contentFile}"`;
    } else if (seedOptions.contentSource === 'content' && seedOptions.content) {
      cmd += ` \\\n  --content "${seedOptions.content.replace(/"/g, '\\"')}"`;
    }
    
    if (seedOptions.pinned) {
      cmd += ` \\\n  --pinned`;
    }
    
    if (seedOptions.folderId) {
      cmd += ` \\\n  --folder-id "${seedOptions.folderId}"`;
    }
    
    if (seedOptions.position) {
      cmd += ` \\\n  --position ${seedOptions.position}`;
    }
    
    if (seedOptions.taskIds) {
      cmd += ` \\\n  --task-ids "${seedOptions.taskIds}"`;
    }
    
    return cmd;
  };

  const buildMoveCommand = (): string => {
    let cmd = 'bun run tools/seeder/src/index.ts move';
    
    if (moveOptions.noteId) {
      cmd += ` \\\n  --note-id "${moveOptions.noteId}"`;
    }
    
    if (moveOptions.folderId !== undefined && moveOptions.folderId !== '') {
      if (moveOptions.folderId === 'null') {
        cmd += ` \\\n  --folder-id null`;
      } else {
        cmd += ` \\\n  --folder-id "${moveOptions.folderId}"`;
      }
    }
    
    if (moveOptions.useEnd) {
      cmd += ` \\\n  --end`;
    } else if (moveOptions.position) {
      cmd += ` \\\n  --position ${moveOptions.position}`;
    }
    
    return cmd;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="my-8 p-6 border rounded-lg bg-gray-50 dark:bg-gray-900">
      <h3 className="text-xl font-bold mb-4">Interactive Command Builder</h3>
      
      <div className="mb-4">
        <label className="block mb-2 font-semibold">Command Type:</label>
        <select
          value={commandType}
          onChange={(e) => setCommandType(e.target.value as CommandType)}
          className="w-full p-2 border rounded dark:bg-gray-800"
        >
          <option value="seed">Seed a new note</option>
          <option value="move">Move/reposition a note</option>
        </select>
      </div>

      {commandType === 'seed' && (
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-semibold">Title *</label>
            <input
              type="text"
              value={seedOptions.title}
              onChange={(e) => setSeedOptions({ ...seedOptions, title: e.target.value })}
              placeholder="My Note"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Date (dd-mm-yyyy) *</label>
            <input
              type="text"
              value={seedOptions.date}
              onChange={(e) => setSeedOptions({ ...seedOptions, date: e.target.value })}
              placeholder="06-11-2024"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Content Source:</label>
            <select
              value={seedOptions.contentSource}
              onChange={(e) => setSeedOptions({ ...seedOptions, contentSource: e.target.value as 'file' | 'content' })}
              className="w-full p-2 border rounded dark:bg-gray-800"
            >
              <option value="file">From file</option>
              <option value="content">Direct content</option>
            </select>
          </div>
          
          {seedOptions.contentSource === 'file' ? (
            <div>
              <label className="block mb-1 font-semibold">Content File Path</label>
              <input
                type="text"
                value={seedOptions.contentFile}
                onChange={(e) => setSeedOptions({ ...seedOptions, contentFile: e.target.value })}
                placeholder="./notes/my-note.md"
                className="w-full p-2 border rounded dark:bg-gray-800"
              />
            </div>
          ) : (
            <div>
              <label className="block mb-1 font-semibold">Content</label>
              <textarea
                value={seedOptions.content}
                onChange={(e) => setSeedOptions({ ...seedOptions, content: e.target.value })}
                placeholder="# My Note\n\nContent here..."
                rows={4}
                className="w-full p-2 border rounded dark:bg-gray-800"
              />
            </div>
          )}
          
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={seedOptions.pinned}
                onChange={(e) => setSeedOptions({ ...seedOptions, pinned: e.target.checked })}
              />
              <span className="font-semibold">Pin this note</span>
            </label>
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Folder ID (optional)</label>
            <input
              type="text"
              value={seedOptions.folderId}
              onChange={(e) => setSeedOptions({ ...seedOptions, folderId: e.target.value })}
              placeholder="folder-uuid or leave empty"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Position (optional)</label>
            <input
              type="number"
              value={seedOptions.position}
              onChange={(e) => setSeedOptions({ ...seedOptions, position: e.target.value })}
              placeholder="Leave empty for auto"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Task IDs (optional, comma-separated)</label>
            <input
              type="text"
              value={seedOptions.taskIds}
              onChange={(e) => setSeedOptions({ ...seedOptions, taskIds: e.target.value })}
              placeholder="task-id-1,task-id-2"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
        </div>
      )}

      {commandType === 'move' && (
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-semibold">Note ID *</label>
            <input
              type="text"
              value={moveOptions.noteId}
              onChange={(e) => setMoveOptions({ ...moveOptions, noteId: e.target.value })}
              placeholder="note-uuid-here"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="block mb-1 font-semibold">Folder ID (optional, use "null" for root)</label>
            <input
              type="text"
              value={moveOptions.folderId}
              onChange={(e) => setMoveOptions({ ...moveOptions, folderId: e.target.value })}
              placeholder="folder-uuid or null"
              className="w-full p-2 border rounded dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={moveOptions.useEnd}
                onChange={(e) => setMoveOptions({ ...moveOptions, useEnd: e.target.checked })}
              />
              <span className="font-semibold">Place at end of list</span>
            </label>
          </div>
          
          {!moveOptions.useEnd && (
            <div>
              <label className="block mb-1 font-semibold">Position</label>
              <input
                type="number"
                value={moveOptions.position}
                onChange={(e) => setMoveOptions({ ...moveOptions, position: e.target.value })}
                placeholder="0"
                className="w-full p-2 border rounded dark:bg-gray-800"
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded">
        <div className="flex items-center justify-between mb-2">
          <label className="font-semibold">Generated Command:</label>
          <button
            onClick={() => copyToClipboard(commandType === 'seed' ? buildSeedCommand() : buildMoveCommand())}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Copy
          </button>
        </div>
        <pre className="p-3 bg-gray-900 text-green-400 rounded overflow-x-auto text-sm">
          {commandType === 'seed' ? buildSeedCommand() : buildMoveCommand()}
        </pre>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm">
        <strong>Note:</strong> The Seeder Tool currently uses an interactive menu system and does not support CLI arguments. 
        These commands are examples for future implementation or scripting purposes.
      </div>
    </div>
  );
}

