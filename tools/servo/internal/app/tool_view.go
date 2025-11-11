package app

import (
	"fmt"
	"strings"
)

func (m Model) viewTool() string {
	if m.serverProcess == nil {
		return BoxStyle.Render("Starting tool...")
	}

	var s strings.Builder

	// Title
	s.WriteString(TitleStyle.Render("Tool Session"))
	s.WriteString("\n\n")

	// Status box
	statusContent := "Tool session active"
	statusBox := StatusBoxStyle.
		BorderForeground(InfoColor).
		Render(InfoStyle.Render(statusContent))
	s.WriteString(statusBox)
	s.WriteString("\n\n")

	// Output box with better formatting
	output := m.serverProcess.GetRecentOutput(15)
	formattedOutput := formatToolOutput(output)
	outputBox := OutputBoxStyle.Render(formattedOutput)
	s.WriteString(outputBox)
	s.WriteString("\n\n")

	// Keyboard shortcuts
	shortcuts := []struct {
		key  string
		desc string
	}{
		{"q", "quit"},
		{"r", "restart"},
		{"/", "filter"},
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

func formatToolOutput(output string) string {
	if output == "" {
		return DimStyle.Render("Waiting for output...")
	}

	lines := strings.Split(output, "\n")
	formatted := make([]string, 0, len(lines))

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Add indicators for common patterns
		formattedLine := line
		if strings.Contains(strings.ToLower(line), "error") || strings.Contains(strings.ToLower(line), "failed") {
			formattedLine = fmt.Sprintf("[error] %s", ErrorStyle.Render(line))
		} else if strings.Contains(strings.ToLower(line), "success") || strings.Contains(strings.ToLower(line), "completed") || strings.Contains(strings.ToLower(line), "done") {
			formattedLine = fmt.Sprintf("[ok] %s", SuccessStyle.Render(line))
		} else if strings.Contains(strings.ToLower(line), "warning") || strings.Contains(strings.ToLower(line), "warn") {
			formattedLine = fmt.Sprintf("[warn] %s", WarningStyle.Render(line))
		} else if strings.Contains(strings.ToLower(line), "info") || strings.Contains(strings.ToLower(line), "info:") {
			formattedLine = fmt.Sprintf("[info] %s", InfoStyle.Render(line))
		} else if strings.Contains(strings.ToLower(line), "seed") || strings.Contains(strings.ToLower(line), "seeding") {
			formattedLine = fmt.Sprintf("[seed] %s", line)
		} else {
			formattedLine = DimStyle.Render(line)
		}

		formatted = append(formatted, formattedLine)
	}

	return strings.Join(formatted, "\n")
}
