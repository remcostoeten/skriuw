package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/joho/godotenv"
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7C3AED")).
			Padding(0, 1)

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#10B981")).
			Bold(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#EF4444")).
			Bold(true)

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7C3AED")).
			Bold(true)

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
	isFolder bool
	children []*treeItem
	expanded bool
	level    int
	parent   *treeItem
}

// Database node structure
type dbNode struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	ParentFolderID string `json:"parent_folder_id"`
	Type           string `json:"type"` // "note" or "folder"
	Content        string `json:"content"` // For editing
}

// Model
type model struct {
	list         list.Model
	state        viewState
	statusMsg    string
	errorMsg     string
	provider     string
	envPath      string
	projectRoot  string
	width        int
	height       int
	treeRoot     *treeItem
	flatTree     []*treeItem // Flattened visible tree for list navigation
	treeCursor   int
	explorerMsg  string
}

// Messages
type statusMsg string
type errorMsg string
type providerMsg string

// Key bindings
type keyMap struct {
	Back   key.Binding
	Quit   key.Binding
	Select key.Binding
	All    key.Binding
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

func initialModel() model {
	projectRoot := findProjectRoot()
	envPath := filepath.Join(projectRoot, "packages", "db", ".env")

	provider := detectProvider(envPath)

	items := []list.Item{
		menuItem{"📊 Status", "Check database connection and Docker status", "status"},
		menuItem{"🔄 Switch Provider", "Toggle between Local Docker and Neon Cloud", "provider"},
		menuItem{"🐳 Docker", "Manage Docker PostgreSQL container", "docker"},
		menuItem{"📋 Schema", "Generate/push database schema", "schema"},
		menuItem{"🌱 Seed DB", "Run database seed script", "seed"},
		menuItem{"📸 Snapshots", "Manage local database snapshots", "snapshots"},
		menuItem{"🖥️  Studio", "Open Drizzle Studio", "studio"},
		menuItem{"📋 Copy DB URL", "Copy DATABASE_URL to clipboard", "copy-url"},
		menuItem{"📁 Explorer", "Interactive note tree explorer", "explorer"},
	}

	delegate := list.NewDefaultDelegate()
	delegate.Styles.SelectedTitle = selectedStyle
	delegate.Styles.SelectedDesc = dimStyle

	l := list.New(items, delegate, 0, 0)
	l.Title = "🗄️  Skriuw Database Manager"
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)
	l.Styles.Title = titleStyle
	l.SetShowHelp(true)

	return model{
		list:        l,
		state:       viewMain,
		provider:    provider,
		envPath:     envPath,
		projectRoot: projectRoot,
	}
}

func detectProvider(envPath string) string {
	env, err := godotenv.Read(envPath)
	if err != nil {
		return "unknown"
	}

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
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.list.SetSize(msg.Width-4, msg.Height-8)
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

	case tea.KeyMsg:
		switch {
		case key.Matches(msg, keys.Quit):
			return m, tea.Quit

		case key.Matches(msg, keys.Back):
			if m.state == viewExplorer {
				m.state = viewMain
				m.list.Title = "Skriuw Database Manager"
				return m, nil
			}
			if m.state != viewMain {
				m.state = viewMain
				m.list.SetItems(mainMenuItems())
				m.list.Title = "Skriuw Database Manager"
				m.statusMsg = ""
				m.errorMsg = ""
				return m, nil
			}

		case key.Matches(msg, keys.Select):
			if m.state == viewExplorer {
				return m.toggleExpand()
			}
			if i, ok := m.list.SelectedItem().(menuItem); ok {
				return m.handleAction(i.action)
			}

		// Tree Navigation
		case msg.String() == "up", msg.String() == "k":
			if m.state == viewExplorer {
				if m.treeCursor > 0 {
					m.treeCursor--
				}
				return m, nil
			}
		case msg.String() == "down", msg.String() == "j":
			if m.state == viewExplorer {
				if m.treeCursor < len(m.flatTree)-1 {
					m.treeCursor++
				}
				return m, nil
			}
		case msg.String() == "right", msg.String() == "l":
			if m.state == viewExplorer {
				return m.expandNode()
			}
		case msg.String() == "left", msg.String() == "h":
			if m.state == viewExplorer {
				return m.collapseNode()
			}

		// Actions
		case msg.String() == "d": // Delete
			if m.state == viewExplorer {
				return m.deleteCurrentNode()
			}
		case msg.String() == "e": // Edit
			if m.state == viewExplorer {
				return m.editCurrentNode()
			}
		}
	}

	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

func mainMenuItems() []list.Item {
	return []list.Item{
		menuItem{"Status", "Check database connection and Docker status", "status"},
		menuItem{"Explorer", "Interactive note tree explorer", "explorer"},
		menuItem{"Switch Provider", "Toggle between Local Docker and Neon Cloud", "provider"},
		menuItem{"Docker", "Manage Docker PostgreSQL container", "docker"},
		menuItem{"Schema", "Generate/push database schema", "schema"},
		menuItem{"Seed DB", "Run database seed script", "seed"},
		menuItem{"Import MDX", "Import MDX files as notes", "seed-mdx"},
		menuItem{"Snapshots", "Manage local database snapshots", "snapshots"},
		menuItem{"Studio", "Open Drizzle Studio", "studio"},
		menuItem{"Print Tree", "Print application file tree", "print-tree"},
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

	case "studio":
		return m, m.runStudio()
	}

	return m, nil
}

func (m model) fetchTree() tea.Cmd {
	return func() tea.Msg {
		// For now, return empty tree
		// In a full implementation, this would fetch from database
		root := &treeItem{name: "Root", isFolder: true, expanded: true, level: 0}
		m.treeRoot = root
		m.rebuildFlatTree()
		return statusMsg("Tree loaded (empty)")
	}
}

func (m *model) rebuildFlatTree() {
	m.flatTree = []*treeItem{}
	var walk func(*treeItem)
	walk = func(n *treeItem) {
		if n != m.treeRoot { // Don't show root node itself
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

func (m model) toggleExpand() (tea.Model, tea.Cmd) {
	if m.treeCursor >= len(m.flatTree) {
		return m, nil
	}
	item := m.flatTree[m.treeCursor]
	if item.isFolder {
		item.expanded = !item.expanded
		m.rebuildFlatTree()
	}
	return m, nil
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
		// Jump to parent
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
	// Placeholder implementation
	return m, func() tea.Msg {
		return statusMsg("Delete functionality not implemented")
	}
}

func (m model) editCurrentNode() (tea.Model, tea.Cmd) {
	// Placeholder implementation
	return m, func() tea.Msg {
		return statusMsg("Edit functionality not implemented")
	}
}

func (m model) View() string {
	if m.state == viewExplorer {
		var s strings.Builder
		s.WriteString("\n  Note Explorer\n\n")

		if len(m.flatTree) == 0 {
			s.WriteString("  (No notes found or tree not loaded)\n")
		}

		for i, item := range m.flatTree {
			cursor := "  "
			if m.treeCursor == i {
				cursor = "> "
			}

			icon := "📄"
			if item.isFolder {
				if item.expanded {
					icon = "📂"
				} else {
					icon = "📁"
				}
			}

			indent := strings.Repeat("  ", item.level)
			line := fmt.Sprintf("%s%s%s %s\n", cursor, indent, icon, item.name)

			if m.treeCursor == i {
				s.WriteString(selectedStyle.Render(line))
			} else {
				s.WriteString(line)
			}
		}

		s.WriteString("\n  j/k: nav • h/l: collapse/expand • e: edit • d: delete • esc: back")
		return docStyle.Render(s.String())
	}

	var s strings.Builder

	// Header with provider indicator
	providerBadge := ""
	switch m.provider {
	case "postgres":
		providerBadge = lipgloss.NewStyle().
			Background(lipgloss.Color("#3B82F6")).
			Foreground(lipgloss.Color("#FFFFFF")).
			Padding(0, 1).
			Render("LOCAL DOCKER")
	case "neon":
		providerBadge = lipgloss.NewStyle().
			Background(lipgloss.Color("#F97316")).
			Foreground(lipgloss.Color("#FFFFFF")).
			Padding(0, 1).
			Render("NEON CLOUD")
	default:
		providerBadge = dimStyle.Render("UNKNOWN")
	}

	s.WriteString(fmt.Sprintf("\n  %s\n\n", providerBadge))

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

// Helper function implementations (simplified)
func (m model) checkStatus() tea.Cmd {
	return func() tea.Msg {
		return statusMsg("Status check not implemented")
	}
}

func (m model) setProvider(provider string) tea.Cmd {
	return func() tea.Msg {
		return statusMsg(fmt.Sprintf("Switched to %s", provider))
	}
}

func (m model) copyDatabaseURL() tea.Cmd {
	return func() tea.Msg {
		return statusMsg("Copy URL not implemented")
	}
}

func (m model) runSeed() tea.Cmd {
	return func() tea.Msg {
		return statusMsg("Seed functionality not implemented")
	}
}

func (m model) runStudio() tea.Cmd {
	return func() tea.Msg {
		return statusMsg("Studio functionality not implemented")
	}
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v", err)
		os.Exit(1)
	}
}