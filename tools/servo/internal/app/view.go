package app

import (
	"fmt"
	"strings"
)

func (m Model) viewMenu() string {
	var s strings.Builder

	// Title
	title := TitleStyle.Render(m.currentMenu.Title)
	s.WriteString(title)
	s.WriteString("\n\n")

	// Breadcrumbs
	if len(m.menuStack) > 1 {
		breadcrumbs := make([]string, len(m.menuStack))
		for i, menu := range m.menuStack {
			// Clean title for breadcrumbs
			cleanTitle := strings.TrimSpace(menu.Title)

			if i == len(m.menuStack)-1 {
				breadcrumbs[i] = BreadcrumbActiveStyle.Render(cleanTitle)
			} else {
				breadcrumbs[i] = BreadcrumbStyle.Render(cleanTitle)
			}
		}
		s.WriteString(strings.Join(breadcrumbs, DimStyle.Render(" / ")))
		s.WriteString("\n\n")
	}

	if m.statusMessage != "" {
		statusBox := StatusBoxStyle
		var rendered string

		switch m.statusState {
		case StatusLevelSuccess:
			statusBox = statusBox.BorderForeground(SuccessColor)
			rendered = SuccessStyle.Render(m.statusMessage)
		case StatusLevelError:
			statusBox = statusBox.BorderForeground(ErrorColor)
			rendered = ErrorStyle.Render(m.statusMessage)
		default:
			statusBox = statusBox.BorderForeground(InfoColor)
			rendered = InfoStyle.Render(m.statusMessage)
		}

		s.WriteString(statusBox.Render(rendered))
		s.WriteString("\n\n")
	}

	// Menu items
	for i, item := range m.currentMenu.Items {
		label := fmt.Sprintf("[%d]", i+1)
		if m.currentMenu.Cursor == i {
			cursor := "▸"
			itemText := fmt.Sprintf("%s %s %s %s", cursor, label, item.Icon, item.Name)
			s.WriteString(SelectedItemStyle.Render(itemText))
		} else {
			cursor := " "
			itemText := fmt.Sprintf("%s %s %s %s", cursor, label, item.Icon, item.Name)
			s.WriteString(ItemStyle.Render(itemText))
		}
		s.WriteString("\n")
	}

	// Help text
	s.WriteString("\n")
	if len(m.menuStack) > 1 {
		keys := []string{
			DimStyle.Render("↑↓"),
			DimStyle.Render("enter"),
			DimStyle.Render("backspace"),
			DimStyle.Render("q"),
		}
		s.WriteString(HelpStyle.Render(fmt.Sprintf("%s navigate  %s select  %s back  %s quit",
			keys[0], keys[1], keys[2], keys[3])))
	} else {
		keys := []string{
			DimStyle.Render("↑↓"),
			DimStyle.Render("enter"),
			DimStyle.Render("q"),
		}
		s.WriteString(HelpStyle.Render(fmt.Sprintf("%s navigate  %s select  %s quit",
			keys[0], keys[1], keys[2])))
	}

	return BoxStyle.Render(s.String())
}

func (m Model) viewRunning() string {
	if m.serverProcess == nil {
		return BoxStyle.Render("Starting server...")
	}

	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("Server Running"))
	s.WriteString("\n\n")

	// Status box
	if m.serverProcess.Port != "" {
		statusContent := fmt.Sprintf("● Running on http://localhost:%s", m.serverProcess.Port)
		statusBox := StatusBoxStyle.
			BorderForeground(SuccessColor).
			Render(SuccessStyle.Render(statusContent))
		s.WriteString(statusBox)
	} else {
		statusContent := "○ Starting server..."
		statusBox := StatusBoxStyle.
			BorderForeground(InfoColor).
			Render(InfoStyle.Render(statusContent))
		s.WriteString(statusBox)
	}
	s.WriteString("\n")

	// Output box with scrolling and filtering
	allOutput := m.serverProcess.GetAllOutput()
	outputLines := strings.Split(allOutput, "\n")

	// Apply filter if set
	if m.outputFilter != "" {
		filtered := make([]string, 0)
		filterLower := strings.ToLower(m.outputFilter)
		for _, line := range outputLines {
			if strings.Contains(strings.ToLower(line), filterLower) {
				filtered = append(filtered, line)
			}
		}
		outputLines = filtered
	}

	totalLines := len(outputLines)
	visibleLines := 12

	start := m.outputOffset
	if start > totalLines-visibleLines {
		start = totalLines - visibleLines
	}
	if start < 0 {
		start = 0
	}

	end := start + visibleLines
	if end > totalLines {
		end = totalLines
	}

	visibleOutput := strings.Join(outputLines[start:end], "\n")
	if visibleOutput == "" {
		if m.outputFilter != "" {
			visibleOutput = fmt.Sprintf("No lines matching '%s'", m.outputFilter)
		} else {
			visibleOutput = "Waiting for output..."
		}
	}

	outputBox := OutputBoxStyle.Render(visibleOutput)
	s.WriteString(outputBox)

	// Scroll indicator and filter info
	infoParts := []string{}
	if totalLines > visibleLines {
		infoParts = append(infoParts, fmt.Sprintf("Lines %d-%d of %d", start+1, end, totalLines))
	}
	if m.outputFilter != "" {
		infoParts = append(infoParts, fmt.Sprintf("Filter: '%s'", m.outputFilter))
	}
	if len(infoParts) > 0 {
		s.WriteString("\n")
		s.WriteString(DimStyle.Render(strings.Join(infoParts, " | ")))
	}
	s.WriteString("\n\n")

	// Keyboard shortcuts - clean grid layout
	shortcuts := []struct {
		key  string
		desc string
	}{
		{"o", "open browser"},
		{"r", "restart"},
		{"p", "install pkg"},
		{"g", "github"},
		{"↑↓/jk", "scroll"},
		{"/", "filter"},
		{"h", "help"},
		{"q", "quit"},
	}

	var shortcutLines []string
	for _, sc := range shortcuts {
		line := fmt.Sprintf("%s %s",
			KeyStyle.Render(sc.key),
			KeyDescStyle.Render(sc.desc))
		shortcutLines = append(shortcutLines, line)
	}
	s.WriteString(strings.Join(shortcutLines, "  "))

	return BoxStyle.Render(s.String())
}

func (m Model) viewBuilding() string {
	if m.buildProcess == nil {
		return BoxStyle.Render("Starting build...")
	}

	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render(m.buildProcess.TaskName))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		statusBox := StatusBoxStyle.
			BorderForeground(SuccessColor).
			Render(SuccessStyle.Render("[ok] Build completed"))
		s.WriteString(statusBox)
		s.WriteString("\n")
		s.WriteString(DimStyle.Render("Returning to menu..."))
	} else {
		statusBox := StatusBoxStyle.
			BorderForeground(InfoColor).
			Render(SpinnerStyle.Render("○ Building..."))
		s.WriteString(statusBox)
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := OutputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s cancel", KeyStyle.Render("ctrl+c"))))

	return BoxStyle.Render(s.String())
}

func (m Model) viewDeploying() string {
	if m.buildProcess == nil {
		return BoxStyle.Render("Starting deployment...")
	}

	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render(m.buildProcess.TaskName))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		statusBox := StatusBoxStyle.
			BorderForeground(SuccessColor).
			Render(SuccessStyle.Render("[ok] Deployment completed"))
		s.WriteString(statusBox)
		s.WriteString("\n")
		s.WriteString(DimStyle.Render("Returning to menu..."))
	} else {
		statusBox := StatusBoxStyle.
			BorderForeground(InfoColor).
			Render(SpinnerStyle.Render("○ Deploying..."))
		s.WriteString(statusBox)
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := OutputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s cancel", KeyStyle.Render("ctrl+c"))))

	return BoxStyle.Render(s.String())
}
