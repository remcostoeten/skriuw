package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
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
			if i == len(m.menuStack)-1 {
				breadcrumbs[i] = accentStyle.Render(menu.Title)
			} else {
				breadcrumbs[i] = dimStyle.Render(menu.Title)
			}
		}
		s.WriteString(strings.Join(breadcrumbs, dimStyle.Render(" › ")))
		s.WriteString("\n\n")
	}

	// Menu items
	for i, item := range m.currentMenu.Items {
		cursor := "  "
		if m.currentMenu.Cursor == i {
			cursor = "▶ "
			itemText := fmt.Sprintf("%s %s %s", cursor, item.Icon, item.Name)
			s.WriteString(selectedItemStyle.Render(itemText))
		} else {
			itemText := fmt.Sprintf("%s %s %s", cursor, item.Icon, item.Name)
			s.WriteString(itemStyle.Render(itemText))
		}
		s.WriteString("\n")
	}

	// Help text
	s.WriteString("\n")
	if len(m.menuStack) > 1 {
		s.WriteString(helpStyle.Render("↑/↓: navigate • enter: select • backspace: back • q: quit"))
	} else {
		s.WriteString(helpStyle.Render("↑/↓: navigate • enter: select • q: quit"))
	}

	return boxStyle.Render(s.String())
}

func (m model) viewRunning() string {
	if m.serverProcess == nil {
		return boxStyle.Render("Starting server...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render("🚀 Server Running"))
	s.WriteString("\n\n")

	// Status
	if m.serverProcess.Port != "" {
		statusLine := fmt.Sprintf("✓ Running on http://localhost:%s", m.serverProcess.Port)
		s.WriteString(successStyle.Render(statusLine))
	} else {
		s.WriteString(infoStyle.Render("⏳ Starting server..."))
	}
	s.WriteString("\n\n")

	// Output box
	output := m.serverProcess.GetRecentOutput(12)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)
	s.WriteString("\n\n")

	// Keyboard shortcuts
	shortcuts := []struct {
		key  string
		desc string
		style lipgloss.Style
	}{
		{"O", "Open in browser", successStyle},
		{"R", "Restart server", warningStyle},
		{"P", "Install package", infoStyle},
		{"G", "Open GitHub", accentStyle},
		{"Q", "Stop & return", dimStyle},
	}

	for _, sc := range shortcuts {
		line := fmt.Sprintf("%s  %s", sc.style.Render(sc.key), sc.desc)
		s.WriteString(line)
		s.WriteString("  ")
	}

	return boxStyle.Render(s.String())
}

func (m model) viewBuilding() string {
	if m.buildProcess == nil {
		return boxStyle.Render("Starting build...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render(fmt.Sprintf("🔨 %s", m.buildProcess.TaskName)))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		s.WriteString(successStyle.Render("✓ Build completed!"))
		s.WriteString("\n")
		s.WriteString(dimStyle.Render("Returning to menu..."))
	} else {
		s.WriteString(spinnerStyle.Render("⚙  Building... Please wait"))
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(helpStyle.Render("ctrl+c: cancel"))

	return boxStyle.Render(s.String())
}

func (m model) viewDeploying() string {
	if m.buildProcess == nil {
		return boxStyle.Render("Starting deployment...")
	}

	var s strings.Builder

	// Title
	s.WriteString(titleStyle.Render(fmt.Sprintf("🌐 %s", m.buildProcess.TaskName)))
	s.WriteString("\n\n")

	// Status
	if m.buildProcess.IsDone() {
		s.WriteString(successStyle.Render("✓ Deployment completed!"))
		s.WriteString("\n")
		s.WriteString(dimStyle.Render("Returning to menu..."))
	} else {
		s.WriteString(spinnerStyle.Render("🚀 Deploying... Please wait"))
	}
	s.WriteString("\n\n")

	// Output
	output := m.buildProcess.GetRecentOutput(15)
	outputBox := outputBoxStyle.Render(output)
	s.WriteString(outputBox)

	s.WriteString("\n\n")
	s.WriteString(helpStyle.Render("ctrl+c: cancel"))

	return boxStyle.Render(s.String())
}