package app

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/process"
)

// updateTerminal handles terminal mode input and command execution
func (m Model) updateTerminal(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc", "q", "l", "L":
			// Return to running view
			m.state = StateRunning
			return m, nil

		case "a", "A":
			// Switch to AI mode
			m.state = StateAI
			m.aiModeChoice = 0
			return m, nil

		case "enter":
			// Execute command
			if m.terminalInput == "" {
				return m, nil
			}

			// Add command to history
			m.terminalHistory = append(m.terminalHistory, m.terminalInput)
			m.terminalHistoryIdx = len(m.terminalHistory)

			// Add command to output
			workDir := m.config.RootDir
			if m.serverProcess != nil && m.serverProcess.WorkDir != "" {
				workDir = m.serverProcess.WorkDir
			}
			m.terminalOutput = append(m.terminalOutput, fmt.Sprintf("$ %s", m.terminalInput))

			// Execute command
			cmdParts := strings.Fields(m.terminalInput)
			if len(cmdParts) == 0 {
				m.terminalInput = ""
				return m, nil
			}

			cmd := exec.Command(cmdParts[0], cmdParts[1:]...)
			cmd.Dir = workDir
			cmd.Env = os.Environ()

			output, err := cmd.CombinedOutput()
			if err != nil {
				m.terminalOutput = append(m.terminalOutput, fmt.Sprintf("[error] %v", err))
			}
			if len(output) > 0 {
				outputLines := strings.Split(strings.TrimRight(string(output), "\n"), "\n")
				m.terminalOutput = append(m.terminalOutput, outputLines...)
			}

			m.terminalInput = ""
			return m, nil

		case "backspace":
			if len(m.terminalInput) > 0 {
				m.terminalInput = m.terminalInput[:len(m.terminalInput)-1]
			}
			return m, nil

		case "up":
			// Navigate history
			if len(m.terminalHistory) > 0 && m.terminalHistoryIdx > 0 {
				m.terminalHistoryIdx--
				m.terminalInput = m.terminalHistory[m.terminalHistoryIdx]
			}
			return m, nil

		case "down":
			// Navigate history forward
			if m.terminalHistoryIdx < len(m.terminalHistory)-1 {
				m.terminalHistoryIdx++
				m.terminalInput = m.terminalHistory[m.terminalHistoryIdx]
			} else {
				m.terminalHistoryIdx = len(m.terminalHistory)
				m.terminalInput = ""
			}
			return m, nil

		case "ctrl+c":
			// Clear input
			m.terminalInput = ""
			return m, nil

		default:
			// Regular character input
			if len(msg.String()) == 1 {
				m.terminalInput += msg.String()
			}
			return m, nil
		}

	case process.ServerOutputMsg:
		// Keep server output flowing even in terminal mode
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
			return m, process.WaitForServerOutput()
		}
		return m, nil
	}

	return m, nil
}

// updateAI handles AI mode selection and Claude CLI integration
func (m Model) updateAI(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc", "q", "l", "L":
			// Return to running view
			m.state = StateRunning
			return m, nil

		case "t", "T":
			// Switch to terminal mode
			m.state = StateTerminal
			return m, nil

		case "up", "k":
			if m.aiModeChoice > 0 {
				m.aiModeChoice--
			}
			return m, nil

		case "down", "j":
			if m.aiModeChoice < 1 {
				m.aiModeChoice++
			}
			return m, nil

		case "enter", " ":
			// Launch Claude CLI
			var claudeCmd *exec.Cmd

			if m.aiModeChoice == 0 {
				// Fresh Claude instance
				// Use user's shell to resolve 'cl' alias
				shell := os.Getenv("SHELL")
				if shell == "" {
					shell = "/bin/sh"
				}
				claudeCmd = exec.Command(shell, "-c", "cl 2>/dev/null || claude")
			} else {
				// Claude with terminal output prefilled
				// Get last 100 lines of server output
				outputLines := make([]string, 0)
				if m.serverProcess != nil {
					allOutput := m.serverProcess.GetAllOutput()
					lines := strings.Split(allOutput, "\n")
					start := len(lines) - 100
					if start < 0 {
						start = 0
					}
					outputLines = lines[start:]
				}

				// Create context text
				contextText := strings.Join(outputLines, "\n")
				if contextText == "" {
					contextText = "No server output available."
				}

				// Pipe context to Claude CLI
				// Use user's shell to resolve 'cl' alias
				shell := os.Getenv("SHELL")
				if shell == "" {
					shell = "/bin/sh"
				}
				escapedContext := strings.ReplaceAll(contextText, "'", "'\"'\"'")
				claudeCmd = exec.Command(shell, "-c", fmt.Sprintf("echo '%s' | (cl 2>/dev/null || claude)", escapedContext))
			}

			// Launch Claude in background
			claudeCmd.Env = os.Environ()
			claudeCmd.Dir = m.config.RootDir
			if m.serverProcess != nil && m.serverProcess.WorkDir != "" {
				claudeCmd.Dir = m.serverProcess.WorkDir
			}

			// Try to run Claude CLI in a new terminal window if possible
			// Otherwise run in background
			go func() {
				claudeCmd.Run()
			}()

			// Return to running view
			m.state = StateRunning
			m.statusState = StatusLevelSuccess
			if m.aiModeChoice == 0 {
				m.statusMessage = formatStatusMessage("[ok]", "Launched Claude CLI (fresh instance)")
			} else {
				m.statusMessage = formatStatusMessage("[ok]", "Launched Claude CLI with terminal output context")
			}
			return m, nil

		case "1":
			m.aiModeChoice = 0
			return m, nil

		case "2":
			m.aiModeChoice = 1
			return m, nil
		}

	case process.ServerOutputMsg:
		// Keep server output flowing even in AI mode
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
			return m, process.WaitForServerOutput()
		}
		return m, nil
	}

	return m, nil
}

