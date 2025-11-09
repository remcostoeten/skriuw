package app

import (
	"fmt"
	"strings"
)

func (m Model) viewHelp() string {
	var s strings.Builder

	s.WriteString(TitleStyle.Render("Servo Help"))
	s.WriteString("\n\n")

	// General Navigation
	s.WriteString(AccentStyle.Render("Navigation:"))
	s.WriteString("\n")
	helpItems := []struct {
		key  string
		desc string
	}{
		{"↑↓ / jk", "Navigate menu items"},
		{"enter", "Select item"},
		{"backspace / esc", "Go back"},
		{"q", "Quit"},
		{"h / ?", "Toggle help"},
	}

	for _, item := range helpItems {
		s.WriteString(fmt.Sprintf("  %s  %s\n",
			KeyStyle.Render(item.key),
			DimStyle.Render(item.desc)))
	}

	s.WriteString("\n")

	// Server Running
	s.WriteString(AccentStyle.Render("When Server is Running:"))
	s.WriteString("\n")
	serverItems := []struct {
		key  string
		desc string
	}{
		{"o", "Open in browser"},
		{"r", "Restart server"},
		{"p", "Install package"},
		{"g", "Open GitHub repo"},
		{"↑↓ / jk", "Scroll output"},
		{"/", "Filter output"},
		{"home", "Scroll to top"},
		{"q", "Stop and quit"},
	}

	for _, item := range serverItems {
		s.WriteString(fmt.Sprintf("  %s  %s\n",
			KeyStyle.Render(item.key),
			DimStyle.Render(item.desc)))
	}

	s.WriteString("\n")

	// Tools
	s.WriteString(AccentStyle.Render("Tools:"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • Select a tool to run it"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • You'll be prompted to select a directory"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • Output includes status tags"))
	s.WriteString("\n\n")

	// Tips
	s.WriteString(AccentStyle.Render("Tips:"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • Use 'Kill Dev Processes' to clean up"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • Servo auto-detects your project structure"))
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("  • Press 'h' anytime to toggle this help"))
	s.WriteString("\n\n")

	// Footer
	s.WriteString(HelpStyle.Render("Press 'h' or 'q' to close help"))

	return BoxStyle.Render(s.String())
}
