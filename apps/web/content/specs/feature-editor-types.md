# Editor Strategy

## Overview
Eventually the editor will get types. They will all share the same rich text principles, but each type will be specialized towards a feature.
This allows certain schemas and blocks to be predefined which normally wouldn't make sense in a document.

## Behavior
Upon new file creation, a file should be a **note** by default.
Creating a different type should be done via context menu or toggle in the top bar.

## Planned Types
- **Tasks**: Currently being worked on. Will have its own type for more complete task overview (undecided)
- **Monaco editor**: Post-MVP for full snippet storage
- **Finance**: New type (fully spec'd in separate document)
