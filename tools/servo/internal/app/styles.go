package app

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Palette
	bgColor      = lipgloss.Color("#05070f")
	panelBg      = lipgloss.Color("#0f172a")
	highlightBg  = lipgloss.Color("#1e293b")
	subtleBg     = lipgloss.Color("#111827")
	borderColor  = lipgloss.Color("#1f2a44")
	borderAccent = lipgloss.Color("#28407a")

	textPrimary   = lipgloss.Color("#f8fafc")
	textSecondary = lipgloss.Color("#e2e8f0")
	textMuted     = lipgloss.Color("#94a3b8")
	textDim       = lipgloss.Color("#64748b")

	accentPrimary   = lipgloss.Color("#38bdf8") // sky blue
	accentSecondary = lipgloss.Color("#a855f7") // violet

	successColor = lipgloss.Color("#34d399")
	warningColor = lipgloss.Color("#facc15")
	errorColor   = lipgloss.Color("#f87171")
	infoColor    = lipgloss.Color("#60a5fa")

	// Styles
	BoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderAccent).
			Background(panelBg).
			Padding(2, 4).
			Width(90)

	TitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(accentPrimary).
			Underline(true).
			MarginBottom(1)

	SelectedItemStyle = lipgloss.NewStyle().
				Foreground(accentPrimary).
				Background(highlightBg).
				Bold(true).
				PaddingLeft(2).
				PaddingRight(2).
				MarginLeft(0)

	ItemStyle = lipgloss.NewStyle().
			Foreground(textSecondary).
			Background(subtleBg).
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
			Foreground(accentSecondary).
			Bold(true)

	DimStyle = lipgloss.NewStyle().
			Foreground(textDim)

	SpinnerStyle = lipgloss.NewStyle().
			Foreground(accentSecondary).
			Bold(true)

	OutputBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor).
			Background(subtleBg).
			Padding(1, 2).
			Width(82).
			Height(12).
			Foreground(textSecondary)

	BreadcrumbStyle = lipgloss.NewStyle().
			Foreground(textMuted)

	BreadcrumbActiveStyle = lipgloss.NewStyle().
				Foreground(accentPrimary).
				Bold(true)

	StatusBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(accentSecondary).
			Background(highlightBg).
			Padding(0, 2).
			Foreground(textSecondary).
			MarginBottom(1)

	KeyStyle = lipgloss.NewStyle().
			Foreground(bgColor).
			Background(accentPrimary).
			Bold(true).
			Padding(0, 1)

	KeyDescStyle = lipgloss.NewStyle().
			Foreground(textMuted)

	// Color exports for use in other packages
	SuccessColor = successColor
	ErrorColor   = errorColor
	InfoColor    = infoColor
)
