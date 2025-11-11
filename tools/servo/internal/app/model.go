package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/commands"
	"servo/internal/config"
	"servo/internal/kill"
	"servo/internal/menu"
	"servo/internal/process"
	"servo/internal/theme"
)

type AppState int

const (
	StateMenu AppState = iota
	StateRunning
	StateBuilding
	StateDeploying
	StateToolRunning
	StateDirPicker
	StateHelp
	StateProcessDashboard
	StateSettings
	StateTerminal
	StateAI
	StateConfigView
	StateConfigEdit
	StateConfigAdd
)

type StatusLevel int

const (
	StatusLevelInfo StatusLevel = iota
	StatusLevelSuccess
	StatusLevelError
)

type RunningProcess struct {
	Name    string
	Port    string
	Process *process.ServerProcess
	WorkDir string
}

type Model struct {
	config           *config.ServoConfig
	preferences      *config.UserPreferences
	currentTheme     theme.Theme
	state            AppState
	menuStack        []*menu.MenuContext
	currentMenu      *menu.MenuContext
	serverProcess    *process.ServerProcess
	buildProcess     *process.BuildProcess
	dirPicker        *DirPickerModel
	pendingTool      *menu.MenuItem
	runningProcesses map[string]*RunningProcess
	statusMessage    string
	statusState      StatusLevel
	width            int
	height           int
	outputOffset     int
	outputFilter     string
	showHelp         bool
	loggingEnabled   bool
	logFile          string
	settingsCursor   int
	// Terminal mode fields
	terminalInput      string
	terminalOutput     []string
	terminalHistory    []string
	terminalHistoryIdx int
	terminalCmd        *process.ServerProcess // For running terminal commands
	// AI mode fields
	aiModeChoice      int // 0 = fresh, 1 = with terminal output
	aiPromptPrefilled string
	// Config add form
	configAddForm *ConfigAddForm
}

type ConfigAddForm struct {
	Step    int
	Input   string
	Key     string
	Name    string
	Dir     string
	Command string
	Error   string
}

const configAddTotalSteps = 4

func newConfigAddForm() *ConfigAddForm {
	return &ConfigAddForm{}
}

func (f *ConfigAddForm) currentPrompt() (string, string) {
	switch f.Step {
	case 0:
		return "Enter app key (identifier, e.g. 'web')", ""
	case 1:
		defaultName := f.Key
		if defaultName == "" {
			defaultName = "New App"
		}
		return "Enter display name", defaultName
	case 2:
		defaultDir := f.Dir
		if defaultDir == "" && f.Key != "" {
			defaultDir = filepath.Join("apps", f.Key)
		}
		if defaultDir == "" {
			defaultDir = "apps/<folder>"
		}
		return "Enter directory path", defaultDir
	case 3:
		return "Enter dev command (e.g. 'pnpm run dev')", "pnpm run dev"
	default:
		return "", ""
	}
}

func InitialModel(cfg *config.ServoConfig) Model {
	mainMenu := menu.BuildMainMenu(cfg)

	// Bootstrap user config if it doesn't exist
	config.BootstrapUserConfig()

	// Load user preferences
	prefs := config.LoadPreferences(cfg.RootDir)

	// Get the current theme based on preferences
	currentTheme := theme.GetTheme(theme.ThemeName(prefs.Theme))

	return Model{
		config:             cfg,
		preferences:        prefs,
		currentTheme:       currentTheme,
		state:              StateMenu,
		menuStack:          []*menu.MenuContext{mainMenu},
		currentMenu:        mainMenu,
		statusState:        StatusLevelInfo,
		runningProcesses:   make(map[string]*RunningProcess),
		loggingEnabled:     false,
		settingsCursor:     0,
		terminalOutput:     make([]string, 0),
		terminalHistory:    make([]string, 0),
		terminalHistoryIdx: -1,
		aiModeChoice:       0,
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
	case clearStatusMessageMsg:
		m.statusMessage = ""
		return m, nil
	}

	switch m.state {
	case StateMenu:
		if m.showHelp {
			return m.updateHelp(msg)
		}
		return m.updateMenu(msg)
	case StateRunning:
		return m.updateRunning(msg)
	case StateBuilding:
		return m.updateBuilding(msg)
	case StateDeploying:
		return m.updateDeploying(msg)
	case StateToolRunning:
		return m.updateToolRunning(msg)
	case StateDirPicker:
		return m.updateDirPicker(msg)
	case StateHelp:
		return m.updateHelp(msg)
	case StateProcessDashboard:
		return m.updateProcessDashboard(msg)
	case StateSettings:
		return m.updateSettings(msg)
	case StateTerminal:
		return m.updateTerminal(msg)
	case StateAI:
		return m.updateAI(msg)
	case StateConfigView:
		return m.updateConfigView(msg)
	case StateConfigEdit:
		return m.updateConfigEdit(msg)
	case StateConfigAdd:
		return m.updateConfigAdd(msg)
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
			if m.showHelp {
				m.showHelp = false
				return m, nil
			}
			if len(m.menuStack) > 1 {
				// Get the name of the menu we're returning to
				returningToMenu := m.menuStack[len(m.menuStack)-2]
				m.menuStack = m.menuStack[:len(m.menuStack)-1]
				m.currentMenu = m.menuStack[len(m.menuStack)-1]

				// Show brief status message about navigation
				m.setStatusMessage(fmt.Sprintf("← Back to %s", returningToMenu.Title), StatusLevelInfo)
				m.clearStatusMessageAfter(2 * time.Second)
			} else {
				// Already at root menu, show hint
				m.setStatusMessage("Already at main menu (press 'q' to quit)", StatusLevelInfo)
				m.clearStatusMessageAfter(2 * time.Second)
			}
			return m, nil

		case "h", "H", "?":
			m.showHelp = !m.showHelp
			if m.showHelp {
				m.state = StateHelp
			} else {
				m.state = StateMenu
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
		default:
			if len(msg.String()) == 1 && msg.String()[0] >= '1' && msg.String()[0] <= '9' {
				index := int(msg.String()[0]-'0') - 1
				if index >= 0 && index < len(m.currentMenu.Items) {
					selectedItem := m.currentMenu.Items[index]
					return m.handleMenuSelection(selectedItem)
				}
			}
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
		// Check for port conflicts before starting
		// Extract expected port from command/args if possible
		expectedPorts := []string{"42069", "6969", "1420"} // Common dev ports

		var portConflictMsg string
		for _, port := range expectedPorts {
			inUse, msg, err := kill.CheckPort(port)
			if err != nil {
				// If check fails, continue anyway
				continue
			}
			if inUse {
				portConflictMsg = msg
				break
			}
		}

		if portConflictMsg != "" {
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[warn]", fmt.Sprintf("%s\nUse 'Kill Dev Processes' to free ports", portConflictMsg))
			return m, nil
		}

		// Start server
		m.state = StateRunning
		m.statusMessage = ""
		m.outputOffset = 0
		proc := process.NewServerProcess(
			item.Action.Command,
			item.Action.Args,
			item.Action.WorkDir,
		)
		m.serverProcess = proc

		// Track running process
		processKey := item.Name
		m.runningProcesses[processKey] = &RunningProcess{
			Name:    item.Name,
			Process: proc,
			WorkDir: item.Action.WorkDir,
		}

		// Enable logging if configured
		if m.loggingEnabled {
			logFile := filepath.Join(m.config.RootDir, ".servo", fmt.Sprintf("%s.log", strings.ReplaceAll(processKey, " ", "_")))
			os.MkdirAll(filepath.Dir(logFile), 0755)
			proc.SetLogFile(logFile)
		}

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
		// Show directory picker first
		m.pendingTool = &item
		startDir := item.Action.WorkDir
		if startDir == "" {
			startDir = m.config.RootDir
		}
		m.dirPicker = NewDirPickerModel(startDir)
		m.state = StateDirPicker
		return m, m.dirPicker.Init()

	case menu.MenuTypeUtilityAction:
		// Special handling for dashboard
		if item.Name == "View Dashboard" {
			m.state = StateProcessDashboard
			return m, nil
		}

		if item.UtilityAction == nil {
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[error]", "No action defined for this item")
			return m, nil
		}

		result, err := item.UtilityAction()
		if err != nil {
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[error]", err.Error())
			return m, nil
		}

		m.statusState = StatusLevelSuccess
		m.statusMessage = formatStatusMessage("[ok]", result)
		return m, nil

	case menu.MenuTypeSettings:
		m.state = StateSettings
		m.settingsCursor = 0
		// Find current theme in the list
		themes := theme.AvailableThemes()
		for i, t := range themes {
			if t.Name == m.currentTheme.Name {
				m.settingsCursor = i
				break
			}
		}
		return m, nil

	case menu.MenuTypeConfigView:
		m.state = StateConfigView
		return m, nil

	case menu.MenuTypeConfigEdit:
		m.state = StateConfigEdit
		return m, nil

	case menu.MenuTypeConfigAdd:
		m.state = StateConfigAdd
		m.configAddForm = newConfigAddForm()
		return m, nil

	case menu.MenuTypeConfigReset:
		if err := config.ResetUserConfig(); err != nil {
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[error]", fmt.Sprintf("Failed to reset config: %v", err))
		} else {
			m.statusState = StatusLevelSuccess
			m.statusMessage = formatStatusMessage("[ok]", "Configuration reset to defaults. Backup created.")
		}
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
				// Remove from running processes
				for key, proc := range m.runningProcesses {
					if proc.Process == m.serverProcess {
						delete(m.runningProcesses, key)
						break
					}
				}
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

		case "h", "H", "?":
			m.showHelp = !m.showHelp
			return m, nil

		case "up", "k":
			if m.outputOffset > 0 {
				m.outputOffset--
			}
			return m, nil

		case "down", "j":
			m.outputOffset++
			return m, nil

		case "home":
			m.outputOffset = 0
			return m, nil

		case "/":
			return m, commands.PromptFilter()

		case "t", "T":
			// Enter terminal mode
			m.state = StateTerminal
			m.terminalInput = ""
			m.terminalOutput = make([]string, 0)
			return m, nil

		case "a", "A":
			// Enter AI mode selection
			m.state = StateAI
			m.aiModeChoice = 0
			return m, nil
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
			m.serverProcess.AddOutput(fmt.Sprintf("[error] %v", msg.Err))
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[error]", fmt.Sprintf("Process error: %v", msg.Err))
			return m, process.WaitForServerOutput()
		}
		return m, nil

	case commands.FilterUpdateMsg:
		m.outputFilter = strings.TrimSpace(string(msg))
		m.outputOffset = 0
		if m.outputFilter != "" {
			m.statusState = StatusLevelInfo
			m.statusMessage = formatStatusMessage("[info]", fmt.Sprintf("Output filtered by \"%s\"", m.outputFilter))
		} else {
			m.statusMessage = ""
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

func (m Model) updateDirPicker(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.dirPicker == nil {
		return m, nil
	}

	var cmd tea.Cmd
	updatedPicker, cmd := m.dirPicker.Update(msg)
	m.dirPicker = &updatedPicker

	if m.dirPicker.done {
		if m.dirPicker.selectedDir != "" && m.pendingTool != nil {
			// Start tool with selected directory
			m.state = StateToolRunning
			m.statusMessage = ""
			m.serverProcess = process.NewServerProcess(
				m.pendingTool.Action.Command,
				m.pendingTool.Action.Args,
				m.dirPicker.selectedDir,
			)
			m.pendingTool = nil
			m.dirPicker = nil
			return m, m.serverProcess.Start()
		} else {
			// Cancelled, return to menu
			m.state = StateMenu
			m.dirPicker = nil
			m.pendingTool = nil
			return m, nil
		}
	}

	return m, cmd
}

func (m Model) updateToolRunning(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
				// Remove from running processes
				for key, proc := range m.runningProcesses {
					if proc.Process == m.serverProcess {
						delete(m.runningProcesses, key)
						break
					}
				}
			}
			m.state = StateMenu
			m.serverProcess = nil
			return m, nil

		case "r", "R":
			if m.serverProcess != nil {
				m.serverProcess.Stop()
				m.serverProcess = process.NewServerProcess(
					m.serverProcess.Command,
					m.serverProcess.Args,
					m.serverProcess.WorkDir,
				)
				m.outputOffset = 0 // Reset scroll on restart
				return m, m.serverProcess.Start()
			}

		case "h", "H", "?":
			m.showHelp = !m.showHelp
			return m, nil

		case "up", "k":
			if m.outputOffset > 0 {
				m.outputOffset--
			}
			return m, nil

		case "down", "j":
			m.outputOffset++
			return m, nil

		case "home":
			m.outputOffset = 0
			return m, nil

		case "/":
			return m, commands.PromptFilter()
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
			m.serverProcess.AddOutput(fmt.Sprintf("[error] %v", msg.Err))
			m.statusState = StatusLevelError
			m.statusMessage = formatStatusMessage("[error]", fmt.Sprintf("Tool error: %v", msg.Err))
			return m, process.WaitForServerOutput()
		}
		return m, nil

	case commands.FilterUpdateMsg:
		m.outputFilter = strings.TrimSpace(string(msg))
		m.outputOffset = 0
		if m.outputFilter != "" {
			m.statusState = StatusLevelInfo
			m.statusMessage = formatStatusMessage("[info]", fmt.Sprintf("Output filtered by \"%s\"", m.outputFilter))
		} else {
			m.statusMessage = ""
		}
		return m, nil
	}

	return m, nil
}

func (m Model) updateHelp(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "h", "H", "?", "q", "esc":
			m.showHelp = false
			m.state = StateMenu
			return m, nil
		}
	}
	return m, nil
}

func (m Model) updateProcessDashboard(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			m.state = StateMenu
			return m, nil
		case "s", "S":
			// Stop all processes
			for _, proc := range m.runningProcesses {
				if proc.Process != nil {
					proc.Process.Stop()
				}
			}
			m.runningProcesses = make(map[string]*RunningProcess)
			m.statusState = StatusLevelSuccess
			m.statusMessage = formatStatusMessage("[ok]", "All processes stopped")
			m.state = StateMenu
			return m, nil
		}
	}
	return m, nil
}

func (m Model) updateSettings(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			m.state = StateMenu
			return m, nil

		case "up", "k":
			if m.settingsCursor > 0 {
				m.settingsCursor--
			}
			return m, nil

		case "down", "j":
			themes := theme.AvailableThemes()
			if m.settingsCursor < len(themes)-1 {
				m.settingsCursor++
			}
			return m, nil

		case "enter", " ":
			// Apply selected theme
			themes := theme.AvailableThemes()
			if m.settingsCursor >= 0 && m.settingsCursor < len(themes) {
				selectedTheme := themes[m.settingsCursor]
				m.currentTheme = selectedTheme
				m.preferences.Theme = string(selectedTheme.Name)

				// Save preferences
				if err := config.SavePreferences(m.config.RootDir, m.preferences); err != nil {
					m.statusState = StatusLevelError
					m.statusMessage = formatStatusMessage("[error]", fmt.Sprintf("Failed to save theme: %v", err))
				} else {
					m.statusState = StatusLevelSuccess
					m.statusMessage = formatStatusMessage("[ok]", fmt.Sprintf("Theme changed to %s", selectedTheme.DisplayName))
				}

				// Rebuild styles with new theme
				RebuildStyles(m.currentTheme)

				return m, nil
			}

		default:
			// Number key selection
			if len(msg.String()) == 1 && msg.String()[0] >= '1' && msg.String()[0] <= '9' {
				index := int(msg.String()[0]-'0') - 1
				themes := theme.AvailableThemes()
				if index >= 0 && index < len(themes) {
					m.settingsCursor = index
					// Auto-apply on number selection
					selectedTheme := themes[index]
					m.currentTheme = selectedTheme
					m.preferences.Theme = string(selectedTheme.Name)

					// Save preferences
					if err := config.SavePreferences(m.config.RootDir, m.preferences); err != nil {
						m.statusState = StatusLevelError
						m.statusMessage = formatStatusMessage("[error]", fmt.Sprintf("Failed to save theme: %v", err))
					} else {
						m.statusState = StatusLevelSuccess
						m.statusMessage = formatStatusMessage("[ok]", fmt.Sprintf("Theme changed to %s", selectedTheme.DisplayName))
					}

					// Rebuild styles with new theme
					RebuildStyles(m.currentTheme)

					return m, nil
				}
			}
		}
	}
	return m, nil
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
	case StateToolRunning:
		return m.viewTool()
	case StateDirPicker:
		if m.dirPicker != nil {
			return m.dirPicker.View()
		}
		return ""
	case StateHelp:
		return m.viewHelp()
	case StateProcessDashboard:
		return m.viewProcessDashboard()
	case StateSettings:
		return m.viewSettings()
	case StateTerminal:
		return m.viewTerminal()
	case StateAI:
		return m.viewAI()
	case StateConfigView:
		return m.viewConfigView()
	case StateConfigEdit:
		return m.viewConfigEdit()
	case StateConfigAdd:
		return m.viewConfigAdd()
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

// setStatusMessage sets a status message with the given level
func (m *Model) setStatusMessage(message string, level StatusLevel) {
	m.statusMessage = message
	m.statusState = level
}

// clearStatusMessageAfter returns a command that clears the status message after the given duration
func (m *Model) clearStatusMessageAfter(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg {
		return clearStatusMessageMsg{}
	})
}

// clearStatusMessageMsg is a message to clear the status message
type clearStatusMessageMsg struct{}
