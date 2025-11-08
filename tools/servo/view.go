// tools/servo/view.go (updated with better styling)
package main

import (
	"fmt"
	"strings"
)

func (m model) viewMenu() string {
	var s strings.Builder

	// Title
	title := titleStyle.Render(m.currentMenu.Title)
	s.WriteString(title)
	s.WriteString("\n\n")

	// Breadcrumbs
	if len(m.menuStack) > 1 {
		breadcrumbs := make([]string, len(m.menuStack))
		for i, menu := range m.menuStack {
			// Clean title (remove emojis for breadcrumbs)
			cleanTitle := strings.TrimSpace(strings.TrimLeft(menu.Title, "🎯🚀🔨🌐📚"))

			if i == len(m.menuStack)-1 {
				breadcrumbs[i] = breadcrumbActiveStyle.Render(cleanTitle)
			} else {
				breadcrumbs[i] = breadcrumbStyle.Render(cleanTitle)
			}
		}
		s.WriteString(strings.Join(breadcrumbs, dimStyle.Render(" / ")))
		s.WriteString("\n\n")
	}

	// Menu items
	for i, item := range m.currentMenu.Items {
		if m.currentMenu.Cursor == i {
			cursor := "▸"
			itemText := fmt.Sprintf("%s %s %s", cursor, item.Icon, item.Name)
			s.WriteString(selectedItemStyle.Render(itemText))
		} else {
			cursor := " "
			itemText := fmt.Sprintf("%s %s %s", cursor, item.Icon, item.Name)
			s.WriteString(itemStyle.Render(itemText))
		}
		s.WriteString("\n")
	}

	// Help text
	s.WriteString("\n")
	if len(m.menuStack) > 1 {
		keys := []string{
			dimStyle.Render("↑↓"),
			dimStyle.Render("enter"),
			dimStyle.Render("backspace"),
			dimStyle.Render("q"),
		}
		s.WriteString(helpStyle.Render(fmt.Sprintf("%s navigate  %s select  %s back  %s quit",
			keys[0], keys[1], keys[2], keys[3])))
	} else {
		keys := []string{
			dimStyle.Render("↑↓"),
			dimStyle.Render("enter"),
			dimStyle.Render("q"),
		}
		s.WriteString(helpStyle.Render(fmt.Sprintf("%s navigate  %s select  %s quit",
			keys[0], keys[1], keys[2])))
	}

	return boxStyle.Render(s.String())
}

func (m model) viewRunning() string {
	if m.serverProcess == nil {
		return boxStyle.Render("Starting server...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render("Server Running"))
	s.WriteString("\n\n")

	// Status box
	if m.serverProcess.Port != "" {
		statusContent := fmt.Sprintf("● Running on http://localhost:%s", m.serverProcess.Port)
		statusBox := statusBoxStyle.
			BorderForeground(successColor).
			Render(successStyle.Render(statusContent))
		s.WriteString(statusBox)
	} else {
		statusContent := "○ Starting server..."
		statusBox := statusBoxStyle.
			BorderForeground(infoColor).
			Render(infoStyle.Render(statusContent))
		s.WriteString(statusBox)
	}
	s.WriteString("\n")

	// Output box
	output := m.serverProcess.GetRecentOutput(12)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)
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
		{"q", "quit"},
	}

	var shortcutLines []string
	for _, sc := range shortcuts {
		line := fmt.Sprintf("%s %s",
			keyStyle.Render(sc.key),
			keyDescStyle.Render(sc.desc))
		shortcutLines = append(shortcutLines, line)
	}
	s.WriteString(strings.Join(shortcutLines, "  "))

	return boxStyle.Render(s.String())
}

func (m model) viewBuilding() string {
	if m.buildProcess == nil {
		return boxStyle.Render("Starting build...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render(m.buildProcess.TaskName))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		statusBox := statusBoxStyle.
			BorderForeground(successColor).
			Render(successStyle.Render("✓ Build completed"))
		s.WriteString(statusBox)
		s.WriteString("\n")
		s.WriteString(dimStyle.Render("Returning to menu..."))
	} else {
		statusBox := statusBoxStyle.
			BorderForeground(infoColor).
			Render(spinnerStyle.Render("○ Building..."))
		s.WriteString(statusBox)
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(helpStyle.Render(fmt.Sprintf("%s cancel", keyStyle.Render("ctrl+c"))))

	return boxStyle.Render(s.String())
}

func (m model) viewDeploying() string {
	if m.buildProcess == nil {
		return boxStyle.Render("Starting deployment...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render(m.buildProcess.TaskName))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		statusBox := statusBoxStyle.
			BorderForeground(successColor).
			Render(successStyle.Render("✓ Deployment completed"))
		s.WriteString(statusBox)
		s.WriteString("\n")
		s.WriteString(dimStyle.Render("Returning to menu..."))
	} else {
		statusBox := statusBoxStyle.
			BorderForeground(infoColor).
			Render(spinnerStyle.Render("○ Deploying..."))
		s.WriteString(statusBox)
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(helpStyle.Render(fmt.Sprintf("%s cancel", keyStyle.Render("ctrl+c"))))

	return boxStyle.Render(s.String())
}
