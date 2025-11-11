package app

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/config"
)

// updateConfigView handles viewing the configuration file
func (m Model) updateConfigView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			m.state = StateMenu
			return m, nil
		}
	}
	return m, nil
}

// updateConfigEdit handles editing the configuration file
func (m Model) updateConfigEdit(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			m.state = StateMenu
			return m, nil
		}
	}
	return m, nil
}

// viewConfigView displays the configuration file contents using cat
func (m Model) viewConfigView() string {
	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("Configuration File"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("Viewing servo.config.json"))
	s.WriteString("\n\n")

	configPath := config.UserConfigPath()

	// Read and display config file
	content, err := os.ReadFile(configPath)
	if err != nil {
		errorMsg := fmt.Sprintf("Error reading config file: %v", err)
		s.WriteString(ErrorStyle.Render(errorMsg))
		s.WriteString("\n\n")
		s.WriteString(HelpStyle.Render(fmt.Sprintf("%s back", KeyStyle.Render("esc/q"))))
		return BoxStyle.Render(s.String())
	}

	// Display file contents
	contentStr := string(content)
	if contentStr == "" {
		contentStr = "(empty file)"
	}

	// Split into lines and show in a box
	lines := strings.Split(contentStr, "\n")
	outputBox := OutputBoxStyle.Render(strings.Join(lines, "\n"))
	s.WriteString(outputBox)
	s.WriteString("\n\n")

	// Show file path
	s.WriteString(DimStyle.Render(fmt.Sprintf("File: %s", configPath)))
	s.WriteString("\n\n")

	// Help text
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s back", KeyStyle.Render("esc/q"))))

	return BoxStyle.Render(s.String())
}

// viewConfigEdit shows a message and opens the editor
func (m Model) viewConfigEdit() string {
	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("Edit Configuration"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("Opening configuration file in editor..."))
	s.WriteString("\n\n")

	configPath := config.UserConfigPath()

	// Determine editor
	editor := os.Getenv("EDITOR")
	if editor == "" {
		editor = os.Getenv("VISUAL")
	}
	if editor == "" {
		// Default to nvim, fallback to vim
		if _, err := exec.LookPath("nvim"); err == nil {
			editor = "nvim"
		} else if _, err := exec.LookPath("vim"); err == nil {
			editor = "vim"
		} else {
			editor = "vi"
		}
	}

	// Open editor in background goroutine
	// Note: This is a fire-and-forget operation - editor opens in its own terminal/window
	// The goroutine will complete when the editor process exits
	go func() {
		cmd := exec.Command(editor, configPath)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			// Silently handle errors - editor may fail to start, but user will see the error
			// in their terminal if the editor is launched interactively
			_ = err
		}
	}()

	// Show status
	statusMsg := fmt.Sprintf("Opened %s in %s", configPath, editor)
	s.WriteString(SuccessStyle.Render(statusMsg))
	s.WriteString("\n\n")
	s.WriteString(DimStyle.Render("After editing, press esc/q to return to menu."))
	s.WriteString("\n\n")

	// Help text
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s back", KeyStyle.Render("esc/q"))))

	return BoxStyle.Render(s.String())
}

// updateConfigAdd handles interactive input for adding a new app configuration
func (m Model) updateConfigAdd(msg tea.Msg) (tea.Model, tea.Cmd) {
    if m.configAddForm == nil {
        m.configAddForm = newConfigAddForm()
    }

    form := m.configAddForm

    switch typed := msg.(type) {
    case tea.KeyMsg:
        switch typed.Type {
        case tea.KeyEnter:
            input := strings.TrimSpace(form.Input)
            _, defaultValue := form.currentPrompt()

            switch form.Step {
            case 0:
                if input == "" {
                    form.Error = "Key cannot be empty"
                    return m, nil
                }
                key := strings.ToLower(strings.ReplaceAll(input, " ", "-"))
                form.Key = key
                form.Input = ""
                form.Error = ""
                form.Step++
                _, defaultName := form.currentPrompt()
                form.Name = defaultName
                form.Input = defaultName
                return m, nil
            case 1:
                if input == "" {
                    input = defaultValue
                }
                form.Name = input
                form.Input = ""
                form.Error = ""
                form.Step++
                _, defaultDir := form.currentPrompt()
                form.Dir = defaultDir
                form.Input = defaultDir
                return m, nil
            case 2:
                if input == "" {
                    input = defaultValue
                }
                form.Dir = input
                form.Input = ""
                form.Error = ""
                form.Step++
                _, defaultCmd := form.currentPrompt()
                form.Command = defaultCmd
                form.Input = defaultCmd
                return m, nil
            case 3:
                if input == "" {
                    input = defaultValue
                }
                devParts := strings.Fields(input)
                if len(devParts) == 0 {
                    form.Error = "Command cannot be empty"
                    return m, nil
                }

                form.Command = input

                if err := config.AddOrUpdateAppConfig(form.Key, form.Name, form.Dir, devParts); err != nil {
                    form.Error = fmt.Sprintf("Failed to save config: %v", err)
                    return m, nil
                }

                m.configAddForm = nil
                m.state = StateMenu
                m.statusState = StatusLevelSuccess
                m.statusMessage = formatStatusMessage("[ok]", fmt.Sprintf("Added app '%s' to configuration", form.Key))
                return m, nil
            }

        case tea.KeyEsc, tea.KeyCtrlC:
            m.configAddForm = nil
            m.state = StateMenu
            return m, nil
        case tea.KeyBackspace, tea.KeyCtrlH:
            if len(form.Input) > 0 {
                form.Input = form.Input[:len(form.Input)-1]
            }
        case tea.KeySpace:
            form.Input += " "
        default:
            if typed.String() != "" && typed.Type == tea.KeyRunes {
                form.Input += typed.String()
            }
        }
    }

    return m, nil
}

// viewConfigAdd renders the add-app configuration flow
func (m Model) viewConfigAdd() string {
    if m.configAddForm == nil {
        m.configAddForm = newConfigAddForm()
    }

    form := m.configAddForm

    var s strings.Builder

    s.WriteString(TitleStyle.Render("Add App to Configuration"))
    s.WriteString("\n")
    s.WriteString(DimStyle.Render(fmt.Sprintf("Step %d of %d", form.Step+1, configAddTotalSteps)))
    s.WriteString("\n\n")

    prompt, defaultValue := form.currentPrompt()
    s.WriteString(prompt)
    if defaultValue != "" {
        s.WriteString("\n")
        s.WriteString(DimStyle.Render(fmt.Sprintf("Default: %s", defaultValue)))
    }
    s.WriteString("\n\n")

    if form.Error != "" {
        s.WriteString(ErrorStyle.Render(form.Error))
        s.WriteString("\n\n")
    }

    inputDisplay := form.Input + "▌"
    s.WriteString(OutputBoxStyle.Width(60).Height(3).Render(inputDisplay))
    s.WriteString("\n\n")

    s.WriteString(HelpStyle.Render(fmt.Sprintf("%s confirm  %s cancel", KeyStyle.Render("enter"), KeyStyle.Render("esc"))))

    return BoxStyle.Render(s.String())
}
