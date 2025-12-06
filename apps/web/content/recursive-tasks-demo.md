# Recursive Subtasks & Stacked Panels

## Overview
This demo showcases the new **Recursive Subtask** system with **Stacked Panels**. 
Skriuw now supports infinite task nesting where every task works like a full document.

## How to Use

### 1. Creating Tasks
You can create tasks in two ways:
- Type `/task` and press Enter
- Type `[]` followed by a space
- Or use the formatting toolbar

### 2. Opening the Panel
Click the **arrow icon** to the right of any task to open its detail panel.
The panel slides in from the right.

### 3. Recursive Subtasks
Inside the panel, creating a new task automatically makes it a **subtask** of the current task.
- Type `/task` inside a panel to create a subtask
- Click the arrow on that subtask to open a **new stacked panel**
- Continue this process for infinite depth!

### 4. Stacked Navigation
- As you dive deeper, panels stack horizontally
- Previous panels collapse to the left
- Click any collapsed panel to navigate back
- Click the overlay to close all panels

## Demo List

- [ ] 🚀 **Root Task**: Click my arrow icon to start!
  - [ ] 📅 **Due Dates**: I have a due date picker in the panel header
  - [ ] 📝 **Rich Text**: My description supports full rich text (headings, lists, code)
  - [ ] ♾️ **Recursion**: Create tasks inside me to test nesting!

## Keyboard Shortcuts
- `Mod+Alt+N`: Create new task
- `Mod+Enter`: Check/Uncheck task
