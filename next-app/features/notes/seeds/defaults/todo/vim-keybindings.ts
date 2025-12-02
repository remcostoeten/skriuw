import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const vimKeybindingsNoteSeed: DefaultNote = {
	name: 'Vim Keybindings - Additional Considerations',
	parentFolderName: 'servo',
	contentMarkdown: `# Additional Considerations for Vim Keybindings Implementation

## 1. Count Prefix System

### Implementation Details
- Support numeric prefixes for multiplying commands (e.g., \`3dd\`, \`5j\`, \`10w\`)
- Buffer count state between keystrokes
- Reset count buffer on command completion or mode change
- Display count in status indicator

### Examples
\`\`\`
3j -> Move down 3 lines
2dd -> Delete 2 lines
5w -> Move forward 5 words
\`\`\`

## 2. Text Objects

### Inner/Around Text Objects
- \`iw\`, \`aw\` - inner/around word
- \`is\`, \`as\` - inner/around sentence
- \`ip\`, \`ap\` - inner/around paragraph
- \`i(\`, \`a(\` - inner/around parentheses
- \`i[\`, \`a[\` - inner/around brackets
- \`i{\`, \`a{\` - inner/around braces
- \`i"\`, \`a"\` - inner/around quotes
- \`it\`, \`at\` - inner/around tags (HTML/XML)

### Note-Specific Text Objects
- \`ib\`, \`ab\` - inner/around block (BlockNote specific)
- \`ih\`, \`ah\` - inner/around heading section
- \`ic\`, \`ac\` - inner/around code block
- \`il\`, \`al\` - inner/around list item

## 3. Dot Command (Repeat)

### Core Functionality
- \`.\` repeats last change operation
- Track last change in vim state
- Support complex operations (not just simple edits)
- Handle count prefixes with dot command

### State Management
\`\`\`typescript
type TLastChange = {
  operation: string
  count?: number
  register?: string
  startMode: VimMode
}
\`\`\`

## 4. Command-Line Mode

### Commands Beyond :w, :q
- \`:s/pattern/replacement/\` - substitute
- \`:g/pattern/command\` - global command
- \`:sort\` - sort lines
- \`:!command\` - execute shell command (if applicable)
- \`:set option\` - change settings
- \`:noh\` - clear search highlights
- \`:reg\` - show registers
- \`:marks\` - show marks

### Command History
- Use \`↑\`/\`↓\` to navigate command history
- Store last N commands
- Persist command history to storage

## 5. Window/Split Management

### Keybindings
- \`Ctrl+w s\` - horizontal split
- \`Ctrl+w v\` - vertical split
- \`Ctrl+w h/j/k/l\` - navigate splits
- \`Ctrl+w q\` - close split
- \`Ctrl+w o\` - close other splits
- \`Ctrl+w =\` - equalize split sizes
- \`Ctrl+w +/-\` - resize splits

## 6. Folding Support

### Fold Commands
- \`za\` - toggle fold
- \`zo\` - open fold
- \`zc\` - close fold
- \`zR\` - open all folds
- \`zM\` - close all folds
- \`zj\`/\`zk\` - move to next/previous fold

### Application Context
- Fold heading sections
- Fold code blocks
- Fold nested lists
- Store fold state per note

## 7. Scrolling Commands

### Additional Scroll Keys
- \`Ctrl+d\` - scroll down half page
- \`Ctrl+u\` - scroll up half page
- \`Ctrl+f\` - scroll forward full page
- \`Ctrl+b\` - scroll backward full page
- \`Ctrl+e\` - scroll down one line
- \`Ctrl+y\` - scroll up one line
- \`zt\` - scroll current line to top
- \`zz\` - scroll current line to center
- \`zb\` - scroll current line to bottom

## 8. Advanced Search Features

### Search Options
- Case-sensitive/insensitive toggle
- Whole word matching
- Regex support
- Search across all notes (\`:grep\` equivalent)
- Search history with \`/\` and \`↑\`/\`↓\`

### Search Highlighting
- Highlight all matches
- Incremental search preview
- Clear highlights command (\`:noh\`)
- Highlight current match differently

## 9. Clipboard and Register System

### Register Types
- Unnamed register (\`""\`)
- Numbered registers (\`"0\` - \`"9\`)
- Named registers (\`"a\` - \`"z\`)
- System clipboard (\`"+\`, \`"*\`)
- Black hole register (\`"_\`)
- Last search register (\`"/\`)

### Register Operations
- \`"ayy\` - yank line to register a
- \`"ap\` - paste from register a
- \`:reg\` - show all registers
- Persist registers to storage

## 10. Jump List and Change List

### Jump Navigation
- \`Ctrl+o\` - jump to previous location
- \`Ctrl+i\` - jump to next location
- \`:jumps\` - show jump list
- Persist jump list across sessions

### Change Navigation
- \`g;\` - jump to previous change
- \`g,\` - jump to next change
- \`:changes\` - show change list

## 11. Block-Specific Operations

### BlockNote Navigation
- \`{\` - previous block
- \`}\` - next block
- \`[[\` - previous heading
- \`]]\` - next heading
- \`gd\` - go to definition (if linking between notes)

### Block Manipulation
- \`dib\` - delete inner block
- \`dab\` - delete around block
- \`yib\` - yank inner block
- \`cib\` - change inner block

## 12. Undo Tree Navigation

### Beyond Linear Undo
- Track undo branches
- \`g-\` - go to older text state
- \`g+\` - go to newer text state
- \`:earlier 5m\` - go to state 5 minutes ago
- \`:later 10s\` - go to state 10 seconds later
- \`:undolist\` - show undo tree

## 13. Ex Commands for Note Management

### Note-Specific Commands
- \`:note new\` - create new note
- \`:note rename\` - rename current note
- \`:note delete\` - delete current note
- \`:note move\` - move to different folder
- \`:note export\` - export note
- \`:note duplicate\` - duplicate current note

## 14. Insert Mode Special Keys

### Quick Navigation in Insert Mode
- \`Ctrl+h\` - delete previous character
- \`Ctrl+w\` - delete previous word
- \`Ctrl+u\` - delete to start of line
- \`Ctrl+o\` - execute one normal mode command
- \`Ctrl+r {register}\` - insert register contents
- \`Ctrl+a\` - insert previously inserted text

## 15. Operator Pending Mode Details

### Implementation Requirements
- Clear visual indicator of pending operator
- Timeout for incomplete sequences
- Cancel with \`Esc\`
- Support motion and text object combinations
- Display expected next key in status bar

## 16. Keybinding Conflicts Resolution

### Conflict Detection Strategy
- Check for browser shortcut conflicts
- Check for application shortcut conflicts
- Warn on profile import conflicts
- Allow user to choose priority
- Provide override mechanism

### Common Conflict Areas
- \`Ctrl+w\` (close tab vs window commands)
- \`Ctrl+n\` (new window vs navigation)
- \`Ctrl+t\` (new tab vs tag jump)
- \`Ctrl+f\` (find vs page down)

## 17. Mode Indicators

### Visual Feedback
- Status bar mode indicator
- Cursor shape per mode (block, line, underline)
- Color coding per mode
- Mode indicator in tab title
- Minimalist option for experienced users

## 18. Training Mode

### Progressive Learning
- Tutorial mode for vim beginners
- Hints system showing available commands
- Command palette showing vim equivalents
- Practice exercises for common operations
- Achievement system for learning progress

## 19. Contextual Help System

### In-App Documentation
- \`?\` or \`:help {topic}\` - show help
- Context-sensitive help based on current mode
- Interactive keybinding reference
- Search within help
- Link to external vim resources

## 20. Mobile/Touch Adaptation

### Alternative Approach
- Virtual vim keys overlay
- Gesture-based vim commands
- Simplified vim mode for touch
- Quick mode switcher
- Detect input method and adapt UI

## 21. Performance Optimizations

### Specific Techniques
- Use event delegation for key handlers
- Debounce rapid keystrokes appropriately
- Virtual scrolling for long documents
- Lazy render for large keybinding lists
- Cache compiled keybinding trees
- Use Web Workers for complex parsing

## 22. Collaborative Editing Considerations

### Multi-User Scenarios
- Show other users' cursor modes
- Handle concurrent edits with vim operations
- Sync mode state carefully
- Resolve operation conflicts
- Display remote user actions in vim context

## 23. Plugin Architecture

### Extension Points
- Custom operators
- Custom motions
- Custom text objects
- Custom commands
- Event hooks (mode change, command execution)

### Plugin Format
\`\`\`typescript
type TPlugin = {
  id: string
  name: string
  version: string
  keybindings?: Keybinding[]
  actions?: KeybindingAction[]
  textObjects?: TextObject[]
  onActivate?: () => void
  onDeactivate?: () => void
}
\`\`\`

## 24. Analytics and Usage Tracking

### Metrics to Consider
- Most used keybindings
- Mode distribution time
- Custom keybinding adoption
- Error rate per command
- Feature discovery rate
- Help system usage patterns

## 25. Migration Path

### From Non-Vim Users
- Gradual introduction mode
- Side-by-side command comparison
- Incremental vim feature enablement
- Quick disable/enable toggle
- Preserve muscle memory with hybrid mode

### Import from Other Editors
- VSCode keybinding import
- Sublime Text keybinding import
- IntelliJ IDEA keybinding import
- Mapping translation layer`,
}
