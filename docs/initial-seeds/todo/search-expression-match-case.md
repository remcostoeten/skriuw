You are implementing a feature that comes in two clearly separated parts. You must build them in order. First complete Part One. Only after that is fully working may you continue with Part Two.

PART ONE: Sidebar Search Enhancements
• The sidebar has a top action bar with a search icon. When hovered or clicked, a search input appears.
• Inside this input you must add three small icons. They must be reachable by tabbing and clickable. Each must have a tooltip.
• Icons: Match Case, Match Whole Word, Regex.
• Icons toggle their feature states. They must show active or inactive styling.
• Tabbing order: input, then icons in sequence. Icons must never disturb typing focus.
• Layout must remain intact on all screen sizes.
• You must deliver component structure, state handling, accessibility attributes, and events.

After Part One is complete and validated, proceed to Part Two.

PART TWO: New Document Behavior and Settings
• When a new document is created, the default title is “untitled”.
• Newly created empty documents must auto insert a first level heading that mirrors the title. Example: #untitled.
• Cursor must appear on a new line below this heading.
• This heading insertion must run only when the document is new and empty, never overwrite content.

Settings logic:
• Users can disable auto heading. If disabled, new documents remain blank.
• Users can choose to separate sidebar file name from document title. If enabled:
  • Show an input for default file name.
  • Show an input for default heading.
  • These apply only to new documents.
• AI mode: user can enable background AI generation of a better title and file name.
  • Document begins as untitled.
  • AI generates improved title and file name while the user writes.
  • These update silently and do not interrupt the user.
  • This triggers only once per new document.

You must provide full state logic, UI structure, validation flow, and update sequence for all settings, respecting the rule that Part One must be implemented before Part Two.
