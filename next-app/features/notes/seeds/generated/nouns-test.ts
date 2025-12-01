import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const nounsTestSeed = {
  name: "Nouns Test",
  parentFolderName: "Examples",
  content: [
  {
    "id": "81q7y6e5fisq5st645vup9",
    "type": "paragraph",
    "props": {
      "backgroundColor": "default",
      "textColor": "default",
      "textAlignment": "left"
    },
    "content": [
      {
        "type": "text",
        "text": "**Skriuw** *(noun)*  \n/skrɪu̯/ — *Frisian, “to write.”*  \n\nA local-first desktop application for writing and organizing thoughts. Built with Tauri 2.0, Next.js 15, and InstantDB, **Skriuw** blends note-taking and task management into a single, fast, and private workspace. It supports Markdown editing, offline access, real-time sync, and cross-platform support for Windows, macOS, and Linux.  \n\n---\n\n**Satio** *(noun)*  \n/ˈsa.ti.oː/ — *Latin, “to sow, plant, or bring forth.”*  \n\nA lightweight CLI seeding tool for **Skriuw** that plants Markdown notes into the database. Designed for initializing projects, testing content structures, or quickly populating demo environments with example data.  \n\n---\n\n**Servo** *(noun)*  \n/ˈsɛr.voː/ — *Latin, “servant” or “attendant.”*  \n\nA terminal-based process manager and development launcher. Built with Go and Bubble Tea, **Servo** provides an interactive TUI for orchestrating complex workflows across monorepos or standalone projects. It handles process lifecycles, concurrent builds, and live logs, detects port conflicts, and integrates with AI assistants for contextual debugging. Delivered as a pre-compiled binary, **Servo** acts as the unified command center for development operations.\n\n**Vigilo** *(verb)*  \n/ˈwi.ɡi.loː/ — *Latin, “to watch, stay alert, keep aware.”*  \n\nA lightweight task awareness overlay for development environments. **Vigilo** keeps tasks visible on top of your interface, helping you stay focused, plan effectively, and avoid forgetting important work. Designed for developers who want persistent task clarity without leaving the UI.",
        "styles": {}
      }
    ],
    "children": []
  }
]
} satisfies DefaultNote
