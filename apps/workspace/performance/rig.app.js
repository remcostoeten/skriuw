const select = {
  editor: ".ProseMirror",
  editorScroll: ".editor-scroll",
  tree: '[role="tree"]',
  dialog: "dialog[open]",
  tasks: ".tasks-page",
  searchField: 'input[aria-label="Search notes"]',
  note: (number) => `#treeitem-fixture-wide-note-${String(number).padStart(5, "0")}`,
  button: (label) => `button[aria-label="${label}"]`,
  section: (label) => `nav[aria-label="Primary"] a[aria-label^="${label}"]`,
};

function firstBlock() {
  return document.querySelector(select.editor)?.firstElementChild?.textContent ?? "";
}

function dialogOpen() {
  return document.querySelector(select.dialog) !== null;
}

async function closeDialog(rig) {
  rig.key("Escape");
  await rig.waitFor(() => !dialogOpen(), 3000);
  await rig.sleep(300);
}

async function openDialog(rig, label) {
  rig.click(select.button(label));
  await rig.waitFor(dialogOpen, 3000);
  await rig.sleep(400);
}

function overlay(label) {
  return {
    open: {
      action: (rig) => rig.click(select.button(label)),
      done: dialogOpen,
      after: closeDialog,
      samples: 8,
      watchMs: 600,
    },
    close: {
      before: (rig) => openDialog(rig, label),
      action: (rig) => rig.key("Escape"),
      done: () => !dialogOpen(),
      samples: 8,
      watchMs: 600,
    },
  };
}

const commandMenu = overlay("Command menu");
const settings = overlay("Settings");

window.__rigApp = {
  ready: () =>
    document.querySelector(select.editor) !== null &&
    document.querySelector(select.note(2)) !== null,

  interactions: {
    noteSwitch: {
      async setup(rig) {
        for (const number of [2, 3, 2]) {
          rig.click(select.note(number));
          await rig.sleep(900);
        }
      },
      before: () => firstBlock(),
      action: (rig, _previous, index) => rig.click(select.note(index % 2 ? 2 : 3)),
      done: (_rig, previous) => {
        const now = firstBlock();
        return now !== "" && now !== previous;
      },
      samples: 16,
      warmup: 2,
      watchMs: 600,
    },
    commandMenuOpen: commandMenu.open,
    commandMenuClose: commandMenu.close,
    searchOpen: {
      action: (rig) => rig.click(select.button("Search notes")),
      done: () => document.querySelector(select.searchField) !== null,
      async after(rig) {
        rig.click(select.button("Close search"));
        await rig.waitFor(() => document.querySelector(select.searchField) === null, 3000);
        await rig.sleep(300);
      },
      samples: 8,
      watchMs: 600,
    },
    searchClose: {
      async before(rig) {
        rig.click(select.button("Search notes"));
        await rig.waitFor(() => document.querySelector(select.searchField) !== null, 3000);
        await rig.sleep(300);
      },
      action: (rig) => rig.click(select.button("Close search")),
      done: () => document.querySelector(select.searchField) === null,
      samples: 8,
      watchMs: 600,
    },
    settingsOpen: settings.open,
    settingsClose: settings.close,
    sidebarToggle: {
      before: () =>
        document.querySelector(select.button("Toggle sidebar"))?.getAttribute("aria-expanded"),
      action: (rig) => rig.click(select.button("Toggle sidebar")),
      done: (_rig, previous) =>
        document.querySelector(select.button("Toggle sidebar"))?.getAttribute("aria-expanded") !==
        previous,
      async after(rig) {
        await rig.sleep(500);
      },
      samples: 8,
      watchMs: 600,
    },
    metadataToggle: {
      before: () => document.querySelector('aside[aria-label="Note metadata"]') !== null,
      action: (rig) => rig.click(select.button("Toggle metadata")),
      done: (_rig, previous) =>
        (document.querySelector('aside[aria-label="Note metadata"]') !== null) !== previous,
      async after(rig) {
        await rig.sleep(500);
      },
      samples: 8,
      watchMs: 600,
    },
    sectionTasks: {
      action: (rig) => rig.click(select.section("Tasks")),
      done: (rig) => rig.isVisible(select.tasks),
      async after(rig) {
        rig.click(select.section("Notes"));
        await rig.waitFor(() => !rig.isVisible(select.tasks), 3000);
        await rig.sleep(500);
      },
      samples: 6,
      watchMs: 600,
    },
    sectionNotes: {
      async before(rig) {
        rig.click(select.section("Tasks"));
        await rig.waitFor(() => rig.isVisible(select.tasks), 3000);
        await rig.sleep(500);
      },
      action: (rig) => rig.click(select.section("Notes")),
      done: (rig) => !rig.isVisible(select.tasks) && rig.isVisible(select.editor),
      samples: 6,
      watchMs: 600,
    },
  },

  scrolls: {
    editorScroll: {
      target: () => document.querySelector(select.editorScroll),
      speed: 1,
    },
    treeScroll: {
      target: () => document.querySelector(select.tree),
      speed: 1.2,
    },
  },
};
