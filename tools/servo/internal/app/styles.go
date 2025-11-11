package app

import (
	"github.com/charmbracelet/lipgloss"
	"servo/internal/theme"
)

// Global style variables that can be updated dynamically
var (
	// Current theme colors (can be updated by RebuildStyles)
	bgColor      lipgloss.Color
	cardBg       lipgloss.Color
	borderColor  lipgloss.Color
	borderAccent lipgloss.Color

	textPrimary   lipgloss.Color
	textSecondary lipgloss.Color
	textMuted     lipgloss.Color
	textDim       lipgloss.Color

	accentPrimary lipgloss.Color
	accentHover   lipgloss.Color

	successColor lipgloss.Color
	warningColor lipgloss.Color
	errorColor   lipgloss.Color
	infoColor    lipgloss.Color

	// Styles (will be rebuilt when theme changes)
	BoxStyle lipgloss.Style

	TitleStyle lipgloss.Style

	SelectedItemStyle lipgloss.Style

	ItemStyle lipgloss.Style

	HelpStyle lipgloss.Style

	SuccessStyle lipgloss.Style

	ErrorStyle lipgloss.Style

	WarningStyle lipgloss.Style

	InfoStyle lipgloss.Style

	AccentStyle lipgloss.Style

	DimStyle lipgloss.Style

	SpinnerStyle lipgloss.Style

	OutputBoxStyle lipgloss.Style

	BreadcrumbStyle lipgloss.Style

	BreadcrumbActiveStyle lipgloss.Style

	BreadcrumbRecentStyle lipgloss.Style

	DepthIndicatorStyle lipgloss.Style

	NavHintStyle lipgloss.Style

	StatusBoxStyle lipgloss.Style

	KeyStyle lipgloss.Style

	KeyDescStyle lipgloss.Style

	// Color exports for use in other packages
	SuccessColor lipgloss.Color
	ErrorColor   lipgloss.Color
	InfoColor    lipgloss.Color
)

func init() {
	// Initialize with default theme (dark monochrome)
	RebuildStyles(theme.DarkMonochromeTheme())
}

// RebuildStyles rebuilds all styles with the given theme
// This allows instant theme switching without restarting the application
func RebuildStyles(t theme.Theme) {
	// Update colors from theme
	bgColor = t.BgColor
	cardBg = t.CardBg
	borderColor = t.BorderColor
	borderAccent = t.BorderAccent

	textPrimary = t.TextPrimary
	textSecondary = t.TextSecondary
	textMuted = t.TextMuted
	textDim = t.TextDim

	accentPrimary = t.AccentPrimary
	accentHover = t.AccentHover

	successColor = t.SuccessColor
	warningColor = t.WarningColor
	errorColor = t.ErrorColor
	infoColor = t.InfoColor

	// Rebuild all styles with new colors
	BoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Padding(2, 4).
		Width(90)

	TitleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(textPrimary).
		MarginBottom(1)

	SelectedItemStyle = lipgloss.NewStyle().
		Foreground(accentHover).
		Bold(true).
		Background(cardBg).
		PaddingLeft(2).
		PaddingRight(2).
		MarginLeft(0)

	ItemStyle = lipgloss.NewStyle().
		Foreground(textSecondary).
		PaddingLeft(2)

	HelpStyle = lipgloss.NewStyle().
		Foreground(textMuted).
		Italic(true).
		MarginTop(1)

	SuccessStyle = lipgloss.NewStyle().
		Foreground(successColor).
		Bold(true)

	ErrorStyle = lipgloss.NewStyle().
		Foreground(errorColor).
		Bold(true)

	WarningStyle = lipgloss.NewStyle().
		Foreground(warningColor).
		Bold(true)

	InfoStyle = lipgloss.NewStyle().
		Foreground(infoColor).
		Bold(true)

	AccentStyle = lipgloss.NewStyle().
		Foreground(accentPrimary).
		Bold(true)

	DimStyle = lipgloss.NewStyle().
		Foreground(textDim)

	SpinnerStyle = lipgloss.NewStyle().
		Foreground(textMuted).
		Bold(true)

	OutputBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Background(cardBg).
		Padding(1, 2).
		Width(82).
		Height(12).
		Foreground(textSecondary)

	BreadcrumbStyle = lipgloss.NewStyle().
		Foreground(textMuted)

	BreadcrumbActiveStyle = lipgloss.NewStyle().
		Foreground(textSecondary).
		Bold(true)

	BreadcrumbRecentStyle = lipgloss.NewStyle().
		Foreground(textPrimary)

	DepthIndicatorStyle = lipgloss.NewStyle().
		Foreground(infoColor).
		Bold(true).
		Italic(true)

	NavHintStyle = lipgloss.NewStyle().
		Foreground(textMuted).
		Italic(true)

	StatusBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderAccent).
		Padding(0, 2).
		Foreground(textSecondary).
		MarginBottom(1)

	KeyStyle = lipgloss.NewStyle().
		Foreground(textPrimary).
		Bold(true).
		Background(cardBg).
		Padding(0, 1)

	KeyDescStyle = lipgloss.NewStyle().
		Foreground(textMuted)

	// Update exported colors
	SuccessColor = successColor
	ErrorColor = errorColor
	InfoColor = infoColor
}
