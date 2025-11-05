'use client'

/**
 * Example component demonstrating how to use the keyboard shortcuts system
 * 
 * Usage in any component:
 * 
 * 1. Import the hook:
 *    import { useShortcutListener } from '@/hooks/use-shortcut-manager'
 * 
 * 2. Define your handlers and use the hook:
 *    useShortcutListener({
 *      'toggle-search': handleSearchToggle,
 *      'toggle-folders': handleToggleAllFolders,
 *      'your-custom-action': yourCustomHandler
 *    })
 * 
 * 3. The shortcuts will automatically trigger your handlers when pressed
 */

import { useState } from 'react'
import { useShortcutListener } from '@/hooks/use-shortcut-manager'

export function ShortcutExample() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [foldersExpanded, setFoldersExpanded] = useState(false)

  // Define your handler functions
  const handleSearchToggle = () => {
    setSearchOpen(prev => !prev)
    console.log('Search toggled:', !searchOpen)
  }

  const handleToggleAllFolders = () => {
    setFoldersExpanded(prev => !prev)
    console.log('Folders toggled:', !foldersExpanded)
  }

  // Register the shortcuts with their handlers
  useShortcutListener({
    'toggle-search': handleSearchToggle,
    'toggle-folders': handleToggleAllFolders
  })

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Keyboard Shortcuts Demo</h2>
      
      <div className="space-y-2">
        <div className="p-3 bg-gray-800 rounded">
          <p className="font-semibold">Search Panel</p>
          <p className="text-sm text-gray-400">
            Press <kbd className="px-2 py-1 bg-gray-700 rounded">Cmd/Ctrl + F</kbd> to toggle
          </p>
          <p className="text-sm mt-2">
            Status: <span className={searchOpen ? 'text-green-400' : 'text-red-400'}>
              {searchOpen ? 'Open' : 'Closed'}
            </span>
          </p>
        </div>

        <div className="p-3 bg-gray-800 rounded">
          <p className="font-semibold">Folder Tree</p>
          <p className="text-sm text-gray-400">
            Press <kbd className="px-2 py-1 bg-gray-700 rounded">Cmd/Ctrl + 0</kbd> to toggle
          </p>
          <p className="text-sm mt-2">
            Status: <span className={foldersExpanded ? 'text-green-400' : 'text-red-400'}>
              {foldersExpanded ? 'Expanded' : 'Collapsed'}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
