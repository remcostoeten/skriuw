package app

import (
	"fmt"
	"strings"
)

func (m Model) viewProcessDashboard() string {
	var s strings.Builder

	s.WriteString(TitleStyle.Render("📊 Process Dashboard"))
	s.WriteString("\n\n")

	if len(m.runningProcesses) == 0 {
		s.WriteString(DimStyle.Render("No processes running"))
		s.WriteString("\n\n")
	} else {
		for name, proc := range m.runningProcesses {
			status := "● Running"
			portInfo := ""
			if proc.Port != "" {
				portInfo = fmt.Sprintf(" on port %s", proc.Port)
			} else if proc.Process != nil && proc.Process.Port != "" {
				portInfo = fmt.Sprintf(" on port %s", proc.Process.Port)
			}
			
			statusLine := fmt.Sprintf("%s %s%s", SuccessStyle.Render(status), name, portInfo)
			s.WriteString(statusLine)
			s.WriteString("\n")
			s.WriteString(DimStyle.Render(fmt.Sprintf("  WorkDir: %s", proc.WorkDir)))
			s.WriteString("\n\n")
		}
	}

	// Actions
	s.WriteString(AccentStyle.Render("Actions:"))
	s.WriteString("\n")
	s.WriteString(ItemStyle.Render("  s - Stop all processes"))
	s.WriteString("\n")
	s.WriteString(ItemStyle.Render("  q - Back to menu"))
	s.WriteString("\n\n")

	s.WriteString(HelpStyle.Render("Press 'q' to return to menu"))

	return BoxStyle.Render(s.String())
}

