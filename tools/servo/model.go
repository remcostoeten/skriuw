package main

import (
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

type appState int

const (
	stateMenu appState = iota
	stateRunning
	stateBuilding
	stateDeploying
)

type model struct {
	config        *ServoConfig
	state         appState
	menuStack     []*MenuContext
	currentMenu   *MenuContext
	serverProcess *ServerProcess
	buildProcess  *BuildProcess
	width         int
	height        int
}

type MenuContext struct {
	Title      string
	Items      []MenuItem
	Cursor     int
	ParentMenu *MenuContext
}

func initialModel(config *ServoConfig) model {
	mainMenu := buildMainMenu(config)

	return model{
		config:      config,
		state:       stateMenu,
		menuStack:   []*MenuContext{mainMenu},
		currentMenu: mainMenu,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	}

	switch m.state {
	case stateMenu:
		return m.updateMenu(msg)
	case stateRunning:
		return m.updateRunning(msg)
	case stateBuilding:
		return m.updateBuilding(msg)
	case stateDeploying:
		return m.updateDeploying(msg)
	}

	return m, nil
}

func (m model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
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

func (m model) handleMenuSelection(item MenuItem) (tea.Model, tea.Cmd) {
	switch item.Type {
	case MenuTypeSubmenu:
		// Navigate to submenu
		submenu := buildSubmenu(item, m.config)
		m.menuStack = append(m.menuStack, submenu)
		m.currentMenu = submenu
		return m, nil

	case MenuTypeRunAction:
		// Start server
		m.state = stateRunning
		m.serverProcess = NewServerProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
		)
		return m, m.serverProcess.Start()

	case MenuTypeBuildAction:
		// Start build
		m.state = stateBuilding
		m.buildProcess = NewBuildProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
			item.Name,
		)
		return m, m.buildProcess.Start()

	case MenuTypeDeployAction:
		// Start deploy
		m.state = stateDeploying
		m.buildProcess = NewBuildProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
			item.Name,
		)
		return m, m.buildProcess.Start()

	case MenuTypeExit:
		return m, tea.Quit
	}

	return m, nil
}

func (m model) updateRunning(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
			}
			m.state = stateMenu
			m.serverProcess = nil
			return m, nil

		case "o", "O":
			if m.serverProcess != nil && m.serverProcess.Port != "" {
				return m, tea.Batch(openBrowser(m.serverProcess.Port), waitForServerOutput())
			}

		case "r", "R":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
				m.serverProcess = NewServerProcess(
					m.serverProcess.Command,
					m.serverProcess.Args,
					m.serverProcess.WorkDir,
				)
				return m, m.serverProcess.Start()
			}

		case "p", "P":
			if m.serverProcess != nil {
				return m, tea.Batch(
					promptInstallPackage("bun", m.serverProcess.WorkDir),
					waitForServerOutput(),
				)
			}

		case "g", "G":
			return m, tea.Batch(
				openGitHubRepo(m.config.GitHubRepo),
				waitForServerOutput(),
			)
		}

	case serverOutputMsg:
		if m.serverProcess != nil {
			if line := string(msg); line != "" {
				m.serverProcess.AddOutput(line)
			}
			return m, waitForServerOutput()
		}
		return m, nil

	case serverPortMsg:
		if m.serverProcess != nil {
			m.serverProcess.Port = string(msg)
			return m, waitForServerOutput()
		}
		return m, nil

	case serverErrorMsg:
		if m.serverProcess != nil {
			m.serverProcess.AddOutput(fmt.Sprintf("Error: %v", msg.err))
			return m, waitForServerOutput()
		}
		return m, nil
	}

	return m, nil
}

func (m model) updateBuilding(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case buildOutputMsg:
		// Check if build is complete
		if m.buildProcess != nil {
			if m.buildProcess.IsDone() {
				// Wait a bit before returning to menu so user can see result
				if m.buildProcess.HasError() {
					return m, tea.Tick(time.Second*3, func(t time.Time) tea.Msg {
						return returnToMenuMsg{}
					})
				}
				return m, tea.Tick(time.Second*2, func(t time.Time) tea.Msg {
					return returnToMenuMsg{}
				})
			}
		}
		// Keep polling for output
		return m, waitForBuildOutput()

	case returnToMenuMsg:
		m.state = stateMenu
		m.buildProcess = nil
		return m, nil

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			if m.buildProcess != nil {
				m.buildProcess.Stop()
			}
			m.state = stateMenu
			m.buildProcess = nil
			return m, nil
		}
	}

	return m, nil
}

func (m model) updateDeploying(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Same logic as building
	return m.updateBuilding(msg)
}

func (m model) View() string {
	switch m.state {
	case stateMenu:
		return m.viewMenu()
	case stateRunning:
		return m.viewRunning()
	case stateBuilding:
		return m.viewBuilding()
	case stateDeploying:
		return m.viewDeploying()
	}

	return ""
}
