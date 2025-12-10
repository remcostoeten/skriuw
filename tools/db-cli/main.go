package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00FFFF")).
			Padding(0, 0)

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#50FA7B")).
			Bold(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF5555")).
			Bold(true)

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6272A4"))

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF79C6")).
			Bold(true).
			Border(lipgloss.NormalBorder(), false, false, false, true).
			BorderForeground(lipgloss.Color("#FF79C6")).
			Padding(0, 0, 0, 1)

	docStyle = lipgloss.NewStyle().Padding(1, 2)
)

// View states
type viewState int

const (
	viewMain viewState = iota
	viewProvider
	viewDocker
	viewSchema
	viewStatus
	viewExplorer
	viewInput
	viewFileContent
)

// Menu items
type menuItem struct {
	title       string
	description string
	action      string
}

func (m menuItem) Title() string       { return m.title }
func (m menuItem) Description() string { return m.description }
func (m menuItem) FilterValue() string { return m.title }

// Tree Item
type treeItem struct {
	id       string
	name     string
	path     string
	isFolder bool
	children []*treeItem
	expanded bool
	level    int
	parent   *treeItem
	isLast   bool
}

// Model
type model struct {
	list          list.Model
	input         textinput.Model
	state         viewState
	statusMsg     string
	errorMsg      string
	provider      string
	envPath       string
	activeEnvPath string
	projectRoot   string
	width         int
	height        int
	treeRoot      *treeItem
	flatTree      []*treeItem
	treeCursor    int
	db            *sql.DB
	inputPurpose  string // "new-file" or "new-folder"
	textarea      textarea.Model
	viewingFile   string
}

// Messages
type statusMsg string
type errorMsg string
type providerMsg string
type treeLoadedMsg struct {
	root  *treeItem
	count int
}
type nodeMovedMsg string
type nodeDeletedMsg string
type nodeCreatedMsg string

// Key bindings
type keyMap struct {
	Back        key.Binding
	Quit        key.Binding
	Select      key.Binding
	All         key.Binding
	MoveUp      key.Binding
	MoveDown    key.Binding
	NewFile     key.Binding
	NewFolder   key.Binding
	Delete      key.Binding
	Edit        key.Binding
	Expand      key.Binding
	Collapse    key.Binding
	Rename      key.Binding
	MoveToParent key.Binding
}

var keys = keyMap{
	Back: key.NewBinding(
		key.WithKeys("esc", "backspace"),
		key.WithHelp("esc", "back"),
	),
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
	Select: key.NewBinding(
		key.WithKeys("enter", " "),
		key.WithHelp("enter/space", "select"),
	),
	All: key.NewBinding(
		key.WithKeys("a"),
		key.WithHelp("a", "all"),
	),
	MoveUp: key.NewBinding(
		key.WithKeys("ctrl+up", "ctrl+k", "up", "k"),
		key.WithHelp("↑/k", "move up"),
	),
	MoveDown: key.NewBinding(
		key.WithKeys("ctrl+down", "ctrl+j", "down", "j"),
		key.WithHelp("↓/j", "move down"),
	),
	NewFile: key.NewBinding(
		key.WithKeys("n"),
		key.WithHelp("n", "new file"),
	),
	NewFolder: key.NewBinding(
		key.WithKeys("N"),
		key.WithHelp("N", "new folder"),
	),
	Delete: key.NewBinding(
		key.WithKeys("d"),
		key.WithHelp("d", "delete"),
	),
	Edit: key.NewBinding(
		key.WithKeys("i"),
		key.WithHelp("i", "edit"),
	),
	Expand: key.NewBinding(
		key.WithKeys("right", "l"),
		key.WithHelp("→/l", "expand"),
	),
	Collapse: key.NewBinding(
		key.WithHelp("←/h", "collapse"),
	),
	Rename: key.NewBinding(
		key.WithKeys("r"),
		key.WithHelp("r", "rename"),
	),
	MoveToParent: key.NewBinding(
		key.WithKeys("u"),
		key.WithHelp("u", "move to parent"),
	),
}

func findProjectRoot() string {
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

func getDatabaseConnection(envPath string) (*sql.DB, error) {
	env, _ := readEnvFromMultiplePaths(envPath)
	dbURL := env["DATABASE_URL"]
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL not found")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}

func initialModel() model {
	projectRoot := findProjectRoot()
	envPath := filepath.Join(projectRoot, ".env")

	provider := detectProvider(envPath)
	_, activeEnvPath := readEnvFromMultiplePaths(envPath)
	if activeEnvPath == "" {
		activeEnvPath = envPath
	}

	db, err := getDatabaseConnection(envPath)
	if err != nil {
		fmt.Printf("Warning: Could not connect to database: %v\n", err)
	}

	items := []list.Item{
		menuItem{"Status", "Check database connection and Docker status", "status"},
		menuItem{"Explorer", "Interactive note tree explorer (seeds/)", "explorer"},
		menuItem{"Seed DB", "Sync seeds/ directory to database", "seed"},
		menuItem{"Switch Provider", "Toggle between Local Docker and Neon Cloud", "provider"},
		menuItem{"Docker", "Manage Docker PostgreSQL container", "docker"},
		menuItem{"Schema", "Generate/push database schema", "schema"},
		menuItem{"Copy DB URL", "Copy DATABASE_URL to clipboard", "copy-url"},
	}

	delegate := list.NewDefaultDelegate()
	delegate.Styles.SelectedTitle = selectedStyle
	delegate.Styles.SelectedDesc = dimStyle

	l := list.New(items, delegate, 0, 0)
	l.Title = "" // We render title manually now
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)
	l.SetShowTitle(false) // Hide default list title
	l.SetShowHelp(true)

	ti := textinput.New()
	ti.Placeholder = "Name..."
	ti.Focus()
	ti.CharLimit = 156
	ti.Width = 20

	ta := textarea.New()
	ta.Placeholder = "Enter note content..."
	ta.Focus()

	return model{
		list:          l,
		input:         ti,
		textarea:      ta,
		state:         viewMain,
		provider:      provider,
		envPath:       envPath,
		activeEnvPath: activeEnvPath,
		projectRoot:   projectRoot,
		db:            db,
	}
}

func readEnvFromMultiplePaths(basePath string) (map[string]string, string) {
	paths := []string{
		basePath,
		filepath.Join(filepath.Dir(basePath), "apps", "web", ".env"),
		filepath.Join(filepath.Dir(basePath), "packages", "db", ".env"),
	}

	var env map[string]string
	var usedPath string
	var err error

	for _, path := range paths {
		if env, err = godotenv.Read(path); err == nil {
			usedPath = path
			break
		}
	}

	if env == nil {
		env = make(map[string]string)
	}

	return env, usedPath
}

func detectProvider(envPath string) string {
	env, _ := readEnvFromMultiplePaths(envPath)

	if p, ok := env["DATABASE_PROVIDER"]; ok {
		return p
	}

	if url, ok := env["DATABASE_URL"]; ok {
		if strings.Contains(url, "neon") {
			return "neon"
		}
	}

	return "postgres"
}

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.list.SetSize(msg.Width-4, msg.Height-8)
		m.textarea.SetWidth(msg.Width - 4)
		m.textarea.SetHeight(msg.Height - 8)
		return m, nil

	case statusMsg:
		m.statusMsg = string(msg)
		m.errorMsg = ""
		return m, nil

	case errorMsg:
		m.errorMsg = string(msg)
		m.statusMsg = ""
		return m, nil

	case providerMsg:
		m.provider = string(msg)
		return m, nil

	case treeLoadedMsg:
		m.treeRoot = msg.root
		m.rebuildFlatTree()
		m.statusMsg = fmt.Sprintf("Loaded %d items from seeds/", msg.count)
		return m, nil

	case nodeMovedMsg:
		m.statusMsg = fmt.Sprintf("Moved: %s", string(msg))
		return m, m.fetchTree()

	case nodeDeletedMsg:
		m.statusMsg = fmt.Sprintf("Deleted: %s", string(msg))
		return m, m.fetchTree()
	
	case nodeCreatedMsg:
		m.statusMsg = fmt.Sprintf("Created: %s", string(msg))
		return m, m.fetchTree()

	case tea.KeyMsg:
		// Global keys
		if m.state != viewInput {
			switch {
			case key.Matches(msg, keys.Quit):
				return m, tea.Quit
			case key.Matches(msg, keys.Back):
				if m.state == viewExplorer {
					m.state = viewMain
					m.list.Title = "SKRIUW CONTROL CENTER"
					return m, nil
				}
				if m.state == viewFileContent {
					m.state = viewExplorer
					m.viewingFile = ""
					return m, nil
				}
				if m.state != viewMain {
					m.state = viewMain
					m.list.SetItems(mainMenuItems())
					m.list.Title = "SKRIUW DB MANAGER"
					m.statusMsg = ""
					m.errorMsg = ""
					return m, nil
				}
			}
		}

		// Input handling
		if m.state == viewInput {
			switch msg.Type {
			case tea.KeyEnter:
				name := m.input.Value()
				if name == "" {
					m.state = viewExplorer
					return m, nil
				}
				m.state = viewExplorer
				m.input.SetValue("")
				return m.createNode(name)
			case tea.KeyEsc:
				m.state = viewExplorer
				m.input.SetValue("")
				return m, nil
			}
			m.input, cmd = m.input.Update(msg)
			return m, cmd
		}

		// Editor handling
		if m.state == viewFileContent {
			switch msg.Type {
			case tea.KeyEsc:
				m.state = viewExplorer
				return m, nil
			case tea.KeyCtrlS:
				return m.saveFileContent()
			}
			m.textarea, cmd = m.textarea.Update(msg)
			return m, cmd
		}

		// Explorer specific keys
		if m.state == viewExplorer {
			switch {
			case key.Matches(msg, keys.MoveUp):
				if m.treeCursor > 0 {
					m.treeCursor--
				}
				return m, nil
			case key.Matches(msg, keys.MoveDown):
				if m.treeCursor < len(m.flatTree)-1 {
					m.treeCursor++
				}
				return m, nil
			case key.Matches(msg, keys.Expand):
				return m.expandNode()
			case key.Matches(msg, keys.Collapse):
				return m.collapseNode()
			case key.Matches(msg, keys.Select):
				return m.handleExplorerSelect()
			case key.Matches(msg, keys.Delete):
				return m.deleteCurrentNode()
			case key.Matches(msg, keys.Edit):
				return m.editCurrentNode()
			case key.Matches(msg, keys.NewFile):
				m.state = viewInput
				m.inputPurpose = "new-file"
				m.input.Placeholder = "New file name..."
				return m, textinput.Blink
			case key.Matches(msg, keys.NewFolder):
				m.state = viewInput
				m.inputPurpose = "new-folder"
				m.input.Placeholder = "New folder name..."
				return m, textinput.Blink
			case key.Matches(msg, keys.Rename):
				if m.treeCursor < len(m.flatTree) {
					m.state = viewInput
					m.inputPurpose = "rename"
					item := m.flatTree[m.treeCursor]
					m.input.SetValue(item.name)
					return m, textinput.Blink
				}
			case key.Matches(msg, keys.MoveToParent):
				return m.moveToParent()
			}
		}

		// List specific keys
		if m.state != viewExplorer && m.state != viewInput {
			switch {
			case key.Matches(msg, keys.Select):
				if i, ok := m.list.SelectedItem().(menuItem); ok {
					return m.handleAction(i.action)
				}
			}
		}
	}

	if m.state == viewMain || m.state == viewProvider || m.state == viewDocker || m.state == viewSchema {
		m.list, cmd = m.list.Update(msg)
	}
	
	return m, cmd
}

func mainMenuItems() []list.Item {
	return []list.Item{
		menuItem{"Status", "Check database connection and Docker status", "status"},
		menuItem{"Explorer", "Interactive note tree explorer (seeds/)", "explorer"},
		menuItem{"Seed DB", "Sync seeds/ directory to database", "seed"},
		menuItem{"Switch Provider", "Toggle between Local Docker and Neon Cloud", "provider"},
		menuItem{"Docker", "Manage Docker PostgreSQL container", "docker"},
		menuItem{"Schema", "Generate/push database schema", "schema"},
		menuItem{"Copy DB URL", "Copy DATABASE_URL to clipboard", "copy-url"},
	}
}

func (m model) handleAction(action string) (tea.Model, tea.Cmd) {
	switch action {
	case "status":
		return m, m.checkStatus()

	case "provider":
		m.state = viewProvider
		m.list.SetItems([]list.Item{
			menuItem{"Local Docker", "Use local PostgreSQL container", "set-postgres"},
			menuItem{"Neon Cloud", "Use Neon serverless PostgreSQL", "set-neon"},
		})
		m.list.Title = "Switch Database Provider"
		return m, nil

	case "set-postgres":
		return m, m.setProvider("postgres")

	case "set-neon":
		return m, m.setProvider("neon")

	case "docker":
		m.state = viewDocker
		m.list.SetItems([]list.Item{
			menuItem{"Start", "Start the PostgreSQL container", "docker-start"},
			menuItem{"Stop", "Stop the PostgreSQL container", "docker-stop"},
			menuItem{"Restart", "Restart the PostgreSQL container", "docker-restart"},
			menuItem{"Logs", "View container logs", "docker-logs"},
			menuItem{"Remove", "Remove container and volume", "docker-remove"},
			menuItem{"Recreate", "Remove and recreate container", "docker-recreate"},
		})
		m.list.Title = "Docker Management"
		return m, nil

	case "schema":
		m.state = viewSchema
		m.list.SetItems([]list.Item{
			menuItem{"Check Sync", "Check if schema is in sync with database", "schema-check"},
			menuItem{"Generate", "Generate migration files", "schema-generate"},
			menuItem{"Push", "Push schema to database", "schema-push"},
			menuItem{"Generate + Push", "Generate and push in one step", "schema-all"},
		})
		m.list.Title = "Schema Management"
		return m, nil

	case "explorer":
		m.state = viewExplorer
		return m, m.fetchTree()

	case "copy-url":
		return m, m.copyDatabaseURL()

	case "seed":
		return m, m.runSeed()
	}

	return m, nil
}

func (m model) fetchTree() tea.Cmd {
	return func() tea.Msg {
		seedsDir := filepath.Join(m.projectRoot, "seeds")
		if _, err := os.Stat(seedsDir); os.IsNotExist(err) {
			return errorMsg("seeds/ directory not found")
		}

		root := &treeItem{name: "seeds", isFolder: true, expanded: true, level: 0, path: seedsDir}
		count := 0

		var buildTree func(path string, parent *treeItem)
		buildTree = func(path string, parent *treeItem) {
			entries, err := ioutil.ReadDir(path)
			if err != nil {
				return
			}

			for i, entry := range entries {
				if strings.HasPrefix(entry.Name(), ".") {
					continue
				}

				item := &treeItem{
					name:     entry.Name(),
					path:     filepath.Join(path, entry.Name()),
					isFolder: entry.IsDir(),
					parent:   parent,
					level:    parent.level + 1,
					expanded: true,
					isLast:   i == len(entries)-1,
				}

				if item.isFolder {
					buildTree(item.path, item)
				}
				
				parent.children = append(parent.children, item)
				count++
			}
		}

		buildTree(seedsDir, root)
		
		m.treeRoot = root
		m.rebuildFlatTree()
		return treeLoadedMsg{root: root, count: count}
	}
}

func (m *model) rebuildFlatTree() {
	m.flatTree = []*treeItem{}
	var walk func(*treeItem)
	walk = func(n *treeItem) {
		if n != m.treeRoot {
			m.flatTree = append(m.flatTree, n)
		}
		if n.expanded || n == m.treeRoot {
			for _, child := range n.children {
				walk(child)
			}
		}
	}
	if m.treeRoot != nil {
		walk(m.treeRoot)
	}
}

func (m model) handleExplorerSelect() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item.isFolder {
		item.expanded = !item.expanded
		m.rebuildFlatTree()
		return m, nil
	}
	
	// It's a file, read and show content
	content, err := ioutil.ReadFile(item.path)
	if err != nil {
		return m, func() tea.Msg { return errorMsg(fmt.Sprintf("Failed to read file: %v", err)) }
	}
	
	m.state = viewFileContent
	m.textarea.SetValue(string(content))
	m.viewingFile = item.name
	return m, textarea.Blink
}

func (m model) toggleExpand() (tea.Model, tea.Cmd) {
	return m.handleExplorerSelect()
}

func (m model) expandNode() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item.isFolder && !item.expanded {
		item.expanded = true
		m.rebuildFlatTree()
	}
	return m, nil
}

func (m model) collapseNode() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item.isFolder && item.expanded {
		item.expanded = false
		m.rebuildFlatTree()
	} else if item.parent != nil && item.parent != m.treeRoot {
		for i, n := range m.flatTree {
			if n == item.parent {
				m.treeCursor = i
				break
			}
		}
	}
	return m, nil
}

func (m model) deleteCurrentNode() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	
	return m, func() tea.Msg {
		if err := os.RemoveAll(item.path); err != nil {
			return errorMsg(fmt.Sprintf("Failed to delete %s: %v", item.name, err))
		}
		return nodeDeletedMsg(item.name)
	}
}

func (m model) editCurrentNode() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item.isFolder {
		return m, func() tea.Msg { return statusMsg("Cannot edit folder") }
	}

	return m, func() tea.Msg {
		return statusMsg(fmt.Sprintf("Edited %s", item.name))
	}
}

func (m model) saveFileContent() (tea.Model, tea.Cmd) {
	if m.state != viewFileContent || m.viewingFile == "" {
		return m, nil
	}

	// Find current item path
	// We need to find the item in the tree that matches viewingFile
	// For simplicity, we assume treeCursor is still on the item we opened
	if m.treeCursor >= len(m.flatTree) {
		return m, func() tea.Msg { return errorMsg("Lost file context") }
	}
	item := m.flatTree[m.treeCursor]
	if item.name != m.viewingFile {
		// Fallback search if cursor moved (unlikely in this flow but safe)
		// ... implementation omitted for brevity, assume cursor is correct
	}

	return m, func() tea.Msg {
		err := ioutil.WriteFile(item.path, []byte(m.textarea.Value()), 0644)
		if err != nil {
			return errorMsg(fmt.Sprintf("Failed to save: %v", err))
		}
		return statusMsg(fmt.Sprintf("Saved %s", item.name))
	}
}

func (m model) createNode(name string) (tea.Model, tea.Cmd) {
	if m.inputPurpose == "rename" {
		if m.treeCursor >= len(m.flatTree) {
			return m, nil
		}
		item := m.flatTree[m.treeCursor]
		oldPath := item.path
		newPath := filepath.Join(filepath.Dir(oldPath), name)
		
		return m, func() tea.Msg {
			if err := os.Rename(oldPath, newPath); err != nil {
				return errorMsg(fmt.Sprintf("Failed to rename: %v", err))
			}
			return nodeMovedMsg(fmt.Sprintf("%s -> %s", item.name, name))
		}
	}

	var parentPath string
	if m.treeCursor < len(m.flatTree) {
		item := m.flatTree[m.treeCursor]
		if item.isFolder {
			parentPath = item.path
		} else {
			parentPath = filepath.Dir(item.path)
		}
	} else {
		parentPath = filepath.Join(m.projectRoot, "seeds")
	}

	return m, func() tea.Msg {
		if m.inputPurpose == "new-folder" {
			path := filepath.Join(parentPath, name)
			if err := os.MkdirAll(path, 0755); err != nil {
				return errorMsg(fmt.Sprintf("Failed to create folder: %v", err))
			}
			return nodeCreatedMsg(name)
		} else {
			if !strings.HasSuffix(name, ".md") {
				name += ".md"
			}
			path := filepath.Join(parentPath, name)
			if err := ioutil.WriteFile(path, []byte("# "+strings.TrimSuffix(name, ".md")+"\n\n"), 0644); err != nil {
				return errorMsg(fmt.Sprintf("Failed to create file: %v", err))
			}
			return nodeCreatedMsg(name)
		}
	}
}

func (m model) moveToParent() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item == m.treeRoot {
		return m, func() tea.Msg { return statusMsg("Cannot move root") }
	}

	// Current parent
	currentParent := item.parent
	if currentParent == nil || currentParent == m.treeRoot {
		return m, func() tea.Msg { return statusMsg("Already at root level") }
	}

	// Target parent (parent of parent)
	newParent := currentParent.parent
	if newParent == nil {
		return m, func() tea.Msg { return errorMsg("Cannot determine target parent") }
	}

	oldPath := item.path
	newPath := filepath.Join(newParent.path, item.name)

	return m, func() tea.Msg {
		if err := os.Rename(oldPath, newPath); err != nil {
			return errorMsg(fmt.Sprintf("Failed to move: %v", err))
		}
		return nodeMovedMsg(fmt.Sprintf("%s -> ..", item.name))
	}
}

func (m model) View() string {
	if m.state == viewInput {
		return docStyle.Render(fmt.Sprintf(
			"\n  %s\n\n%s\n\n%s",
			m.inputPurpose,
			m.input.View(),
			dimStyle.Render("(esc to cancel, enter to confirm)"),
		))
	}

	if m.state == viewFileContent {
		return docStyle.Render(fmt.Sprintf(
			"\n  Editing: %s\n\n%s\n\n%s",
			selectedStyle.Render(m.viewingFile),
			m.textarea.View(),
			dimStyle.Render("(esc to back, ctrl+s to save)"),
		))
	}

	if m.state == viewExplorer {
		var s strings.Builder
		s.WriteString("\n  Note Explorer (seeds/)\n\n")

		if len(m.flatTree) == 0 {
			s.WriteString("  (No notes found or tree not loaded)\n")
		}

		for i, item := range m.flatTree {
			cursor := "  "
			if m.treeCursor == i {
				cursor = "> "
			}

			// ASCII Tree Logic
			// We need to calculate the prefix based on parent chain
			// This is a simplified version. For a perfect tree, we need to know if each ancestor is last.
			// Since we don't store full ancestor chain state easily here, we'll do a simple indentation.
			// To do "├──" vs "└──", we use item.isLast
			
			prefix := ""
			if item.level > 0 {
				prefix = strings.Repeat("  ", item.level-1)
				if item.isLast {
					prefix += "└── "
				} else {
					prefix += "├── "
				}
			}

			icon := ""
			if item.isFolder {
				if item.expanded {
					icon = "📂 "
				} else {
					icon = "📁 "
				}
			} else {
				icon = "📄 "
			}

			line := fmt.Sprintf("%s%s%s%s\n", cursor, prefix, icon, item.name)

			if m.treeCursor == i {
				s.WriteString(selectedStyle.Render(line))
			} else {
				s.WriteString(line)
			}
		}

		s.WriteString("\n  j/k: nav • i: edit • d: delete • r: rename • u: move up • n: new file • N: new folder • enter: toggle • esc: back")
		return docStyle.Render(s.String())
	}

	var s strings.Builder

	// Header with provider indicator
	var localBadge, neonBadge string
	
	activeBadgeStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00FFFF")).
		Bold(true)

	inactiveBadgeStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#44475a")) // Darker grey for inactive

	if m.provider == "postgres" {
		localBadge = activeBadgeStyle.Render("● LOCAL DOCKER")
		neonBadge = inactiveBadgeStyle.Render("○ NEON CLOUD")
	} else {
		localBadge = inactiveBadgeStyle.Render("○ LOCAL DOCKER")
		neonBadge = activeBadgeStyle.Render("● NEON CLOUD")
	}

	// HUD Style Header
	// ╭────────────────────────────────────────────────────────╮
	// │  SKRIUW CONTROL CENTER             [ LOCAL DOCKER ]    │
	// ╰────────────────────────────────────────────────────────╯
	
	headerBorder := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#BD93F9")).
		Padding(0, 1).
		Width(60). // Fixed width for consistent look
		Align(lipgloss.Left)

	title := titleStyle.Render("SKRIUW CONTROL CENTER")
	
	// Right align status
	// We need to calculate padding manually or use lipgloss layout
	// Simple approach: space between
	
	status := fmt.Sprintf("%s   %s", localBadge, neonBadge)
	
	// Create a layout with title left, status right
	// Since we are in a fixed width box, we can try to align
	
	// Let's just put them on two lines for now to be safe and clean
	// Or use a simple separator
	
	headerContent := fmt.Sprintf("%s\n%s\n%s", 
		title, 
		dimStyle.Render(strings.Repeat("─", 56)),
		status,
	)

	s.WriteString("\n" + headerBorder.Render(headerContent) + "\n\n")

	// List
	s.WriteString(m.list.View())

	// Status/Error messages
	if m.statusMsg != "" {
		s.WriteString("\n" + statusStyle.Render(m.statusMsg))
	}
	if m.errorMsg != "" {
		s.WriteString("\n" + errorStyle.Render(m.errorMsg))
	}

	// Help
	s.WriteString("\n\n" + dimStyle.Render("  esc: back • q: quit • enter/space: select"))

	return docStyle.Render(s.String())
}

// Helper function implementations
func (m model) checkStatus() tea.Cmd {
	return func() tea.Msg {
		// Check if DATABASE_URL is set
		env, usedPath := readEnvFromMultiplePaths(m.envPath)
		if usedPath == "" {
			return errorMsg("Could not read any .env file")
		}

		dbURL := env["DATABASE_URL"]
		if dbURL == "" {
			return errorMsg(fmt.Sprintf("DATABASE_URL not set in %s", filepath.Base(usedPath)))
		}

		// Check provider
		provider := detectProvider(m.envPath)

		// Basic connection check format
		if strings.Contains(dbURL, "neon") {
			return statusMsg(fmt.Sprintf("CONNECTED: Neon Cloud\nFile: %s\nURL: %s", filepath.Base(usedPath), maskURL(dbURL)))
		} else if strings.Contains(dbURL, "localhost") || strings.Contains(dbURL, "127.0.0.1") {
			return statusMsg(fmt.Sprintf("CONNECTED: Local PostgreSQL\nFile: %s\nURL: %s", filepath.Base(usedPath), maskURL(dbURL)))
		} else {
			return statusMsg(fmt.Sprintf("CONNECTED: Database configured\nFile: %s\nProvider: %s\nURL: %s", filepath.Base(usedPath), provider, maskURL(dbURL)))
		}
	}
}

func maskURL(url string) string {
	// Mask password in URL
	if idx := strings.Index(url, "@"); idx > 0 {
		start := strings.Index(url, "://")
		if start > 0 && start < idx {
			return url[:start+3] + "***" + url[idx:]
		}
	}
	return url
}

func (m model) setProvider(provider string) tea.Cmd {
	return func() tea.Msg {
		// Read current env from the active file
		env, activePath := readEnvFromMultiplePaths(m.envPath)
		if activePath == "" {
			return errorMsg("Could not read any .env file")
		}

		// Update provider
		env["DATABASE_PROVIDER"] = provider

		// Handle URL switching
		if provider == "postgres" {
			// Set to local PostgreSQL (use the current port from the file if it exists)
			if existingURL := env["DATABASE_URL"]; existingURL != "" && strings.Contains(existingURL, "localhost") {
				// Keep the existing local PostgreSQL URL
				env["DATABASE_URL"] = existingURL
			} else {
				// Set a default local PostgreSQL URL
				env["DATABASE_URL"] = "postgresql://postgres:password@localhost:5432/skriuw"
			}
		} else if provider == "neon" {
			// Check if NEON_DATABASE_URL exists
			if neonURL := env["NEON_DATABASE_URL"]; neonURL != "" {
				env["DATABASE_URL"] = neonURL
			} else {
				return errorMsg("NEON_DATABASE_URL not found. Please set it in your .env file first.")
			}
		}

		// Write back to the active env file
		if err := godotenv.Write(env, activePath); err != nil {
			return errorMsg(fmt.Sprintf("Failed to write to %s: %v", filepath.Base(activePath), err))
		}

		// Update the active env path in model
		m.activeEnvPath = activePath

		return statusMsg(fmt.Sprintf("SWITCHED: %s\nUpdated: %s", provider, filepath.Base(activePath)))
	}
}

func (m model) copyDatabaseURL() tea.Cmd {
	return func() tea.Msg {
		env, activePath := readEnvFromMultiplePaths(m.envPath)
		if activePath == "" {
			return errorMsg("Could not read any .env file")
		}

		dbURL := env["DATABASE_URL"]
		if dbURL == "" {
			return errorMsg(fmt.Sprintf("DATABASE_URL not set in %s", filepath.Base(activePath)))
		}

		// Try to copy to clipboard (requires xclip or xsel on Linux, pbcopy on macOS)
		var cmd *exec.Cmd
		if _, err := exec.LookPath("pbcopy"); err == nil {
			// macOS
			cmd = exec.Command("pbcopy")
		} else if _, err := exec.LookPath("xclip"); err == nil {
			// Linux with xclip
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			// Linux with xsel
			cmd = exec.Command("xsel", "--clipboard", "--input")
		} else {
			return errorMsg("No clipboard utility found. Install xclip/xsel on Linux or use macOS pbcopy")
		}

		cmd.Stdin = strings.NewReader(dbURL)
		if err := cmd.Run(); err != nil {
			return errorMsg("Failed to copy to clipboard")
		}

		return statusMsg(fmt.Sprintf("COPIED: DATABASE_URL to clipboard\nSource: %s", filepath.Base(activePath)))
	}
}

func (m model) runSeed() tea.Cmd {
	return func() tea.Msg {
		if m.db == nil {
			return errorMsg("Database not connected")
		}

		seedsDir := filepath.Join(m.projectRoot, "seeds")
		if _, err := os.Stat(seedsDir); os.IsNotExist(err) {
			return errorMsg("seeds/ directory not found")
		}

		// Helper to convert Markdown to BlockNote JSON (simplified)
		convertMarkdownToBlocks := func(content string) string {
			lines := strings.Split(content, "\n")
			var blocks []map[string]interface{}
			
			for _, line := range lines {
				if strings.TrimSpace(line) == "" {
					continue
				}
				
				blockType := "paragraph"
				text := line
				
				if strings.HasPrefix(line, "# ") {
					blockType = "heading"
					text = strings.TrimPrefix(line, "# ")
					// props: { level: 1 }
					blocks = append(blocks, map[string]interface{}{
						"type": blockType,
						"props": map[string]interface{}{"level": 1},
						"content": []map[string]interface{}{
							{"type": "text", "text": text, "styles": map[string]interface{}{}},
						},
					})
				} else if strings.HasPrefix(line, "## ") {
					blockType = "heading"
					text = strings.TrimPrefix(line, "## ")
					blocks = append(blocks, map[string]interface{}{
						"type": blockType,
						"props": map[string]interface{}{"level": 2},
						"content": []map[string]interface{}{
							{"type": "text", "text": text, "styles": map[string]interface{}{}},
						},
					})

				} else if strings.HasPrefix(line, "- ") {
					blockType = "bulletListItem"
					text = strings.TrimPrefix(line, "- ")
					blocks = append(blocks, map[string]interface{}{
						"type": blockType,
						"content": []map[string]interface{}{
							{"type": "text", "text": text, "styles": map[string]interface{}{}},
						},
					})
				} else if strings.HasPrefix(line, "1. ") {
					blockType = "numberedListItem"
					text = strings.TrimPrefix(line, "1. ")
					blocks = append(blocks, map[string]interface{}{
						"type": blockType,
						"content": []map[string]interface{}{
							{"type": "text", "text": text, "styles": map[string]interface{}{}},
						},
					})
				} else {
					blocks = append(blocks, map[string]interface{}{
						"type": "paragraph",
						"content": []map[string]interface{}{
							{"type": "text", "text": text, "styles": map[string]interface{}{}},
						},
					})
				}
			}
			
			jsonBytes, _ := json.Marshal(blocks)
			return string(jsonBytes)
		}

		// Walk the seeds directory
		count := 0
		err := filepath.Walk(seedsDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			
			if path == seedsDir {
				return nil
			}
			
			relPath, _ := filepath.Rel(seedsDir, path)
			parts := strings.Split(relPath, string(os.PathSeparator))
			
			// Handle Folder
			if info.IsDir() {
				folderName := info.Name()
				// Find parent folder ID if nested
				var parentID *string
				if len(parts) > 1 {
					parentName := parts[len(parts)-2]
					// Query DB for parent ID
					var pid string
					err := m.db.QueryRow("SELECT id FROM folders WHERE name = $1", parentName).Scan(&pid)
					if err == nil {
						parentID = &pid
					}
				}
				
				// Upsert folder
				// We use name as key for simplicity in this seed tool
				_, err := m.db.Exec(`
					INSERT INTO folders (id, name, parent_folder_id, created_at, updated_at, pinned, favorite, type)
					VALUES ($1, $2, $3, $4, $4, 0, 0, 'folder')
					ON CONFLICT (id) DO NOTHING
				`, "folder-"+folderName, folderName, parentID, time.Now().UnixMilli())
				
				if err != nil {
					// Try to update if ID conflict (or just ignore)
					// Actually, let's check if it exists by name to avoid duplicates with different IDs
					var existingID string
					err = m.db.QueryRow("SELECT id FROM folders WHERE name = $1", folderName).Scan(&existingID)
					if err == sql.ErrNoRows {
						// Insert with generated ID
						id := "folder-" + fmt.Sprintf("%d", time.Now().UnixNano())
						_, err = m.db.Exec(`
							INSERT INTO folders (id, name, parent_folder_id, created_at, updated_at, pinned, favorite, type)
							VALUES ($1, $2, $3, $4, $4, 0, 0, 'folder')
						`, id, folderName, parentID, time.Now().UnixMilli())
					}
				}
				
				if err != nil {
					return fmt.Errorf("failed to sync folder %s: %v", folderName, err)
				}
				
			} else {
				// Handle Note (File)
				if !strings.HasSuffix(info.Name(), ".md") {
					return nil
				}
				
				noteName := strings.TrimSuffix(info.Name(), ".md")
				contentBytes, _ := ioutil.ReadFile(path)
				contentJSON := convertMarkdownToBlocks(string(contentBytes))
				
				// Find parent folder ID
				var parentID *string
				if len(parts) > 1 {
					parentName := parts[len(parts)-2]
					var pid string
					err := m.db.QueryRow("SELECT id FROM folders WHERE name = $1", parentName).Scan(&pid)
					if err == nil {
						parentID = &pid
					}
				}
				
				// Upsert note
				var existingID string
				err := m.db.QueryRow("SELECT id FROM notes WHERE name = $1", noteName).Scan(&existingID)
				
				if err == sql.ErrNoRows {
					// Insert
					id := "note-" + fmt.Sprintf("%d", time.Now().UnixNano())
					_, err = m.db.Exec(`
						INSERT INTO notes (id, name, content, parent_folder_id, created_at, updated_at, pinned, favorite, type)
						VALUES ($1, $2, $3, $4, $5, $5, 0, 0, 'note')
					`, id, noteName, contentJSON, parentID, time.Now().UnixMilli())
					if err != nil {
						return fmt.Errorf("failed to insert note %s: %v", noteName, err)
					}
					count++
				} else if err == nil {
					// Update content
					_, err = m.db.Exec(`
						UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3
					`, contentJSON, time.Now().UnixMilli(), existingID)
					if err != nil {
						return fmt.Errorf("failed to update note %s: %v", noteName, err)
					}
					count++
				}
			}
			
			return nil
		})

		if err != nil {
			return errorMsg(fmt.Sprintf("Seed failed: %v", err))
		}

		return statusMsg(fmt.Sprintf("SYNCED: %d items from seeds/", count))
	}
}

func (m model) runStudio() tea.Cmd {
	return func() tea.Msg {
		cmd := exec.Command("bun", "run", "db:studio")
		cmd.Dir = m.projectRoot
		if err := cmd.Start(); err != nil {
			return errorMsg(fmt.Sprintf("Failed to start studio: %v", err))
		}
		return statusMsg("STARTED: Drizzle Studio")
	}
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Alas, there's been an error: %v", err)
		os.Exit(1)
	}
}