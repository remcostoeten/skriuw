package app

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/commands"
	"servo/internal/config"
	"servo/internal/menu"
	"servo/internal/process"
)

type AppState int

const (
	StateMenu AppState = iota
	StateRunning
	StateBuilding
	StateDeploying
)

type StatusLevel int

const (
	StatusLevelInfo StatusLevel = iota
	StatusLevelSuccess
	StatusLevelError
)

type Model struct {
	config        *config.ServoConfig
	state         AppState
	menuStack     []*menu.MenuContext
	currentMenu   *menu.MenuContext
	serverProcess *process.ServerProcess
	buildProcess  *process.BuildProcess
	statusMessage string
	statusState   StatusLevel
	width         int
	height        int
}

func InitialModel(cfg *config.ServoConfig) Model {
	mainMenu := menu.BuildMainMenu(cfg)

	return Model{
		config:      cfg,
		state:       StateMenu,
		menuStack:   []*menu.MenuContext{mainMenu},
		currentMenu: mainMenu,
		statusState: StatusLevelInfo,
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	}

	switch m.state {
	case StateMenu:
		return m.updateMenu(msg)
	case StateRunning:
		return m.updateRunning(msg)
	case StateBuilding:
		return m.updateBuilding(msg)
	case StateDeploying:
		return m.updateDeploying(msg)
	}

	return m, nil
}

func (m Model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			if len(m.menuStack) == 1 {
				return m, tea.Quit
			}
			// Go back to parent menu
			m.menuStack = m.menuStack[:len(m.menuStack)-1]
			m.currentMenu = m.menuStack[len(m.menuStack)-1]
			return m, nil

		case "backspace", "esc":
			if len(m.menuStack) > 1 {
				m.menuStack = m.menuStack[:len(m.menuStack)-1]
				m.currentMenu = m.menuStack[len(m.menuStack)-1]
			}
			return m, nil

		case "up", "k":
			if m.currentMenu.Cursor > 0 {
				m.currentMenu.Cursor--
			}

		case "down", "j":
			if m.currentMenu.Cursor < len(m.currentMenu.Items)-1 {
				m.currentMenu.Cursor++
			}

		case "enter":
			selectedItem := m.currentMenu.Items[m.currentMenu.Cursor]
			return m.handleMenuSelection(selectedItem)
		}
	}

	return m, nil
}

func (m Model) handleMenuSelection(item menu.MenuItem) (tea.Model, tea.Cmd) {
	switch item.Type {
	case menu.MenuTypeSubmenu:
		// Navigate to submenu
		submenu := menu.BuildSubmenu(item, m.config)
		m.menuStack = append(m.menuStack, submenu)
		m.currentMenu = submenu
		return m, nil

	case menu.MenuTypeRunAction:
		// Start server
		m.state = StateRunning
		m.statusMessage = ""
		m.serverProcess = process.NewServerProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
		)
		return m, m.serverProcess.Start()

	case menu.MenuTypeBuildAction:
		// Start build
		m.state = StateBuilding
		m.statusMessage = ""
		m.buildProcess = process.NewBuildProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
			item.Name,
		)
		return m, m.buildProcess.Start()

	case menu.MenuTypeDeployAction:
		// Start deploy
		m.state = StateDeploying
		m.statusMessage = ""
		m.buildProcess = process.NewBuildProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
			item.Name,
		)
		return m, m.buildProcess.Start()

	case menu.MenuTypeToolAction:
		// Run tool interactively
		m.state = StateRunning
		m.statusMessage = ""
		m.serverProcess = process.NewServerProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
		)
		return m, m.serverProcess.Start()

	case menu.MenuTypeUtilityAction:
		if item.UtilityAction == nil {
			m.statusState = StatusLevelError
			m.statusMessage = "✗ No action defined for this item"
			return m, nil
		}

		result, err := item.UtilityAction()
		if err != nil {
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("✗", err.Error())
			return m, nil
		}

		m.statusState = StatusLevelSuccess
		m.statusMessage = formatStatusMessage("✓", result)
		return m, nil

	case menu.MenuTypeExit:
		return m, tea.Quit
	}

	return m, nil
}

func (m Model) updateRunning(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
			}
			m.state = StateMenu
			m.serverProcess = nil
			return m, nil

		case "o", "O":
			if m.serverProcess != nil && m.serverProcess.Port != "" {
				return m, tea.Batch(commands.OpenBrowser(m.serverProcess.Port), process.WaitForServerOutput())
			}

		case "r", "R":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
				m.serverProcess = process.NewServerProcess(
					m.serverProcess.Command,
					m.serverProcess.Args,
					m.serverProcess.WorkDir,
				)
				return m, m.serverProcess.Start()
			}

		case "p", "P":
			if m.serverProcess != nil {
				return m, tea.Batch(
					commands.PromptInstallPackage("bun", m.serverProcess.WorkDir),
					process.WaitForServerOutput(),
				)
			}

		case "g", "G":
			return m, tea.Batch(
				commands.OpenGitHubRepo(m.config.GitHubRepo),
				process.WaitForServerOutput(),
			)
		}

	case process.ServerOutputMsg:
		if m.serverProcess != nil {
			if line := string(msg); line != "" {
				m.serverProcess.AddOutput(line)
			}
			return m, process.WaitForServerOutput()
		}
		return m, nil

	case process.ServerPortMsg:
		if m.serverProcess != nil {
			m.serverProcess.Port = string(msg)
			return m, process.WaitForServerOutput()
		}
		return m, nil

	case process.ServerErrorMsg:
		if m.serverProcess != nil {
			m.serverProcess.AddOutput(fmt.Sprintf("Error: %v", msg.Err))
			return m, process.WaitForServerOutput()
		}
		return m, nil
	}

	return m, nil
}

func (m Model) updateBuilding(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case process.BuildOutputMsg:
		// Check if build is complete
		if m.buildProcess != nil {
			if m.buildProcess.IsDone() {
				// Wait a bit before returning to menu so user can see result
				if m.buildProcess.HasError() {
					return m, tea.Tick(time.Second*3, func(t time.Time) tea.Msg {
						return process.ReturnToMenuMsg{}
					})
				}
				return m, tea.Tick(time.Second*2, func(t time.Time) tea.Msg {
					return process.ReturnToMenuMsg{}
				})
			}
		}
		// Keep polling for output
		return m, process.WaitForBuildOutput()

	case process.ReturnToMenuMsg:
		m.state = StateMenu
		m.buildProcess = nil
		return m, nil

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			if m.buildProcess != nil {
				m.buildProcess.Stop()
			}
			m.state = StateMenu
			m.buildProcess = nil
			return m, nil
		}
	}

	return m, nil
}

func (m Model) updateDeploying(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Same logic as building
	return m.updateBuilding(msg)
}

func (m Model) View() string {
	switch m.state {
	case StateMenu:
		return m.viewMenu()
	case StateRunning:
		return m.viewRunning()
	case StateBuilding:
		return m.viewBuilding()
	case StateDeploying:
		return m.viewDeploying()
	}

	return ""
}

func formatStatusMessage(prefix string, message string) string {
	msg := strings.TrimSpace(message)
	if msg == "" {
		return prefix
	}

	lines := strings.Split(msg, "\n")
	lines[0] = fmt.Sprintf("%s %s", prefix, strings.TrimSpace(lines[0]))
	for i := 1; i < len(lines); i++ {
		lines[i] = fmt.Sprintf("  %s", strings.TrimSpace(lines[i]))
	}

	return strings.Join(lines, "\n")
}

