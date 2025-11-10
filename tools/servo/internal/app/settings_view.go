package app

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"servo/internal/theme"
)

func (m Model) viewSettings() string {
	var s strings.Builder

	// Title
	title := TitleStyle.Render("⚙ Settings")
	s.WriteString(title)
	s.WriteString("\n\n")

	// Theme section
	sectionTitle := AccentStyle.Render("Theme")
	s.WriteString(sectionTitle)
	s.WriteString("\n")
	s.WriteString(DimStyle.Render("Select a theme to apply instantly"))
	s.WriteString("\n\n")

	// Status message
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

	// Theme list with previews
	themes := theme.AvailableThemes()
	for i, t := range themes {
		label := fmt.Sprintf("[%d]", i+1)
		
		// Check if this is the current theme
		isCurrent := t.Name == m.currentTheme.Name
		currentIndicator := ""
		if isCurrent {
			currentIndicator = SuccessStyle.Render(" ● ACTIVE")
		}

		// Build theme preview line
		var themeLine string
		if m.settingsCursor == i {
			// Selected theme - highlighted
			themeNameStyled := SelectedItemStyle.Render(fmt.Sprintf("%s %s %s", label, t.DisplayName, currentIndicator))
			themeLine = fmt.Sprintf("▸ %s", themeNameStyled)
			
			// Show description on next line when selected
			s.WriteString(themeLine)
			s.WriteString("\n")
			descLine := "  " + DimStyle.Render(t.Description)
			s.WriteString(descLine)
			s.WriteString("\n")
			
			// Show color preview for selected theme
			previewLine := "  " + renderThemePreview(t)
			s.WriteString(previewLine)
			s.WriteString("\n")
		} else {
			// Unselected theme
			themeLine = fmt.Sprintf("  %s %s%s", ItemStyle.Render(label), ItemStyle.Render(t.DisplayName), DimStyle.Render(currentIndicator))
			s.WriteString(themeLine)
			s.WriteString("\n")
		}
	}

	// Help text
	s.WriteString("\n")
	keys := []string{
		KeyStyle.Render("↑↓/jk"),
		KeyStyle.Render("enter"),
		KeyStyle.Render("1-9"),
		KeyStyle.Render("esc"),
	}
	s.WriteString(HelpStyle.Render(fmt.Sprintf("%s navigate  %s apply  %s quick select  %s back",
		keys[0], keys[1], keys[2], keys[3])))

	return BoxStyle.Render(s.String())
}

// renderThemePreview creates a visual preview of theme colors
func renderThemePreview(t theme.Theme) string {
	// Create color samples
	samples := []struct {
		label string
		color string
	}{
		{"BG", string(t.BgColor)},
		{"Border", string(t.BorderColor)},
		{"Text", string(t.TextPrimary)},
		{"Accent", string(t.AccentPrimary)},
		{"Success", string(t.SuccessColor)},
		{"Error", string(t.ErrorColor)},
	}

	var preview strings.Builder
	for i, sample := range samples {
		if i > 0 {
			preview.WriteString(" ")
		}
		// Create a colored block with the sample
		styled := lipgloss.NewStyle().
			Foreground(lipgloss.Color(sample.color)).
			Render("██")
		preview.WriteString(styled)
	}

	return DimStyle.Render("Preview: ") + preview.String()
}

