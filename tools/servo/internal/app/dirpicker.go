package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type DirPickerModel struct {
	currentDir  string
	entries     []os.DirEntry
	cursor      int
	selectedDir string
	done        bool
}

func NewDirPickerModel(startDir string) *DirPickerModel {
	return &DirPickerModel{
		currentDir: startDir,
		cursor:     0,
	}
}

func (d *DirPickerModel) Init() tea.Cmd {
	return d.loadDir
}

func (d *DirPickerModel) loadDir() tea.Msg {
	entries, err := os.ReadDir(d.currentDir)
	if err != nil {
		return DirPickerErrorMsg{Err: err}
	}

	// Filter to only directories
	dirs := make([]os.DirEntry, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			// Skip hidden directories except .git
			name := entry.Name()
			if strings.HasPrefix(name, ".") && name != ".git" {
				continue
			}
			dirs = append(dirs, entry)
		}
	}

	return DirPickerLoadedMsg{Dirs: dirs}
}

func (d DirPickerModel) Update(msg tea.Msg) (DirPickerModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			d.done = true
			return d, tea.Quit

		case "enter":
			if d.cursor < len(d.entries) {
				selected := d.entries[d.cursor]
				newPath := filepath.Join(d.currentDir, selected.Name())
				d.currentDir = newPath
				d.cursor = 0
				return d, d.loadDir
			} else if d.cursor == len(d.entries) {
				// "Select this directory" option
				d.selectedDir = d.currentDir
				d.done = true
				return d, tea.Quit
			}

		case "backspace":
			parent := filepath.Dir(d.currentDir)
			if parent != d.currentDir {
				d.currentDir = parent
				d.cursor = 0
				return d, d.loadDir
			}

		case "up", "k":
			if d.cursor > 0 {
				d.cursor--
			}

		case "down", "j":
			maxCursor := len(d.entries)
			if d.cursor < maxCursor {
				d.cursor++
			}
		}

	case DirPickerLoadedMsg:
		d.entries = msg.Dirs
		if d.cursor >= len(d.entries) {
			d.cursor = len(d.entries)
		}

	case DirPickerErrorMsg:
		d.done = true
		return d, tea.Quit
	}

	return d, nil
}

func (d *DirPickerModel) View() string {
	var s strings.Builder

	s.WriteString(TitleStyle.Render("Select Directory"))
	s.WriteString("\n\n")

	// Current path
	pathDisplay := DimStyle.Render("Current: ") + AccentStyle.Render(d.currentDir)
	s.WriteString(pathDisplay)
	s.WriteString("\n\n")

	// Directory entries
	if len(d.entries) == 0 {
		s.WriteString(DimStyle.Render("  (no subdirectories)"))
		s.WriteString("\n")
	} else {
		for i, entry := range d.entries {
			cursor := " "
			icon := "[DIR]"
			if i == d.cursor {
				cursor = "▸"
				s.WriteString(SelectedItemStyle.Render(fmt.Sprintf("%s %s %s", cursor, icon, entry.Name())))
			} else {
				s.WriteString(ItemStyle.Render(fmt.Sprintf("%s %s %s", cursor, icon, entry.Name())))
			}
			s.WriteString("\n")
		}
	}

	// "Select this directory" option
	cursor := " "
	label := "Select this directory"
	if d.cursor == len(d.entries) {
		cursor = "▸"
		s.WriteString(SelectedItemStyle.Render(fmt.Sprintf("%s [USE] %s", cursor, label)))
	} else {
		s.WriteString(ItemStyle.Render(fmt.Sprintf("%s [USE] %s", cursor, label)))
	}
	s.WriteString("\n\n")

	// Help
	keys := []string{
		DimStyle.Render("↑↓"),
		DimStyle.Render("enter"),
		DimStyle.Render("backspace"),
		DimStyle.Render("q"),
	}
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s navigate  %s select  %s up  %s cancel",
		keys[0], keys[1], keys[2], keys[3])))

	return BoxStyle.Render(s.String())
}

type DirPickerLoadedMsg struct {
	Dirs []os.DirEntry
}

type DirPickerErrorMsg struct {
	Err error
}
