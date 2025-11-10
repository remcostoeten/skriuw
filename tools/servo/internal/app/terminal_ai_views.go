package app

import (
	"fmt"
	"strings"
)

func (m Model) viewTerminal() string {
	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("Terminal Mode"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("Run commands while server is running"))
	s.WriteString("\n\n")

	// Show server status if available
	if m.serverProcess != nil {
		if m.serverProcess.Port != "" {
			statusContent := fmt.Sprintf("● Server running on http://localhost:%s", m.serverProcess.Port)
			statusBox := StatusBoxStyle.
				BorderForeground(SuccessColor).
				Render(SuccessStyle.Render(statusContent))
			s.WriteString(statusBox)
			s.WriteString("\n\n")
		}
	}

	// Terminal output (last 15 lines)
	outputLines := m.terminalOutput
	if len(outputLines) > 15 {
		outputLines = outputLines[len(outputLines)-15:]
	}
	outputText := strings.Join(outputLines, "\n")
	if outputText == "" {
		outputText = "No output yet. Type a command and press Enter."
	}

	outputBox := OutputBoxStyle.Render(outputText)
	s.WriteString(outputBox)
	s.WriteString("\n\n")

	// Input prompt
	workDir := m.config.RootDir
	if m.serverProcess != nil && m.serverProcess.WorkDir != "" {
		workDir = m.serverProcess.WorkDir
	}
	prompt := fmt.Sprintf("%s $ %s", DimStyle.Render(workDir), AccentStyle.Render(m.terminalInput+"█"))
	s.WriteString(prompt)
	s.WriteString("\n\n")

	// Help text
	keys := []string{
		KeyStyle.Render("enter"),
		KeyStyle.Render("↑↓"),
		KeyStyle.Render("a"),
		KeyStyle.Render("esc/l"),
	}
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s execute  %s history  %s AI mode  %s back to logs",
		keys[0], keys[1], keys[2], keys[3])))

	return BoxStyle.Render(s.String())
}

func (m Model) viewAI() string {
	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("AI Assistant"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("Launch Claude CLI with context"))
	s.WriteString("\n\n")

	// Show server status if available
	if m.serverProcess != nil {
		if m.serverProcess.Port != "" {
			statusContent := fmt.Sprintf("● Server running on http://localhost:%s", m.serverProcess.Port)
			statusBox := StatusBoxStyle.
				BorderForeground(SuccessColor).
				Render(SuccessStyle.Render(statusContent))
			s.WriteString(statusBox)
			s.WriteString("\n\n")
		}
	}

	// Options
	options := []struct {
		label       string
		description string
		selected    bool
	}{
		{
			label:       "Fresh Claude Instance",
			description: "Start Claude CLI without any context",
			selected:    m.aiModeChoice == 0,
		},
		{
			label:       "Claude with Terminal Output",
			description: "Start Claude CLI with last 100 lines of server output prefilled",
			selected:    m.aiModeChoice == 1,
		},
	}

	for i, opt := range options {
		label := fmt.Sprintf("[%d]", i+1)
		if opt.selected {
			cursor := "▸"
			itemText := fmt.Sprintf("%s %s", label, opt.label)
			line := SelectedItemStyle.Render(fmt.Sprintf("%s %s", cursor, itemText))
			s.WriteString(line)
			s.WriteString("\n")
			descLine := "  " + DimStyle.Render(opt.description)
			s.WriteString(descLine)
		} else {
			itemText := fmt.Sprintf("%s %s", label, opt.label)
			line := ItemStyle.Render(fmt.Sprintf("  %s", itemText))
			s.WriteString(line)
		}
		s.WriteString("\n")
	}

	s.WriteString("\n")

	// Help text
	keys := []string{
		KeyStyle.Render("↑↓"),
		KeyStyle.Render("enter"),
		KeyStyle.Render("1-2"),
		KeyStyle.Render("t"),
		KeyStyle.Render("esc/l"),
	}
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s navigate  %s launch  %s quick select  %s terminal  %s back",
		keys[0], keys[1], keys[2], keys[3], keys[4])))

	return BoxStyle.Render(s.String())
}

