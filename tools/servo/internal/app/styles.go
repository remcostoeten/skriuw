package app

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// neutral, vercel-inspired palette
	bgColor      = lipgloss.Color("#0a0a0a")
	cardBg       = lipgloss.Color("#171717")
	borderColor  = lipgloss.Color("#27272a")
	borderAccent = lipgloss.Color("#3f3f46")

	textPrimary   = lipgloss.Color("#fafafa")
	textSecondary = lipgloss.Color("#e5e5e5")
	textMuted     = lipgloss.Color("#a1a1aa")
	textDim       = lipgloss.Color("#71717a")

	accentPrimary = lipgloss.Color("#e5e5e5")
	accentHover   = lipgloss.Color("#fafafa")

	successColor = lipgloss.Color("#22c55e")
	warningColor = lipgloss.Color("#eab308")
	errorColor   = lipgloss.Color("#ef4444")
	infoColor    = lipgloss.Color("#3b82f6")

	// Styles
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

	// Color exports for use in other packages
	SuccessColor = successColor
	ErrorColor   = errorColor
	InfoColor    = infoColor
)
