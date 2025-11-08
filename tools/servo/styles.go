// tools/servo/styles.go
package main

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// shadcn-inspired neutral dark colors
	bgColor        = lipgloss.Color("#0a0a0a")
	cardBg         = lipgloss.Color("#171717")
	borderColor    = lipgloss.Color("#27272a")
	borderAccent   = lipgloss.Color("#3f3f46")
	
	textPrimary    = lipgloss.Color("#fafafa")
	textSecondary  = lipgloss.Color("#e5e5e5")
	textMuted      = lipgloss.Color("#a1a1aa")
	textDim        = lipgloss.Color("#71717a")
	
	accentPrimary  = lipgloss.Color("#e5e5e5")
	accentHover    = lipgloss.Color("#fafafa")
	
	successColor   = lipgloss.Color("#22c55e")
	warningColor   = lipgloss.Color("#eab308")
	errorColor     = lipgloss.Color("#ef4444")
	infoColor      = lipgloss.Color("#3b82f6")
	
	// Styles
	boxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Padding(2, 4).
		Width(90)

	titleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(textPrimary).
		MarginBottom(1)

	selectedItemStyle = lipgloss.NewStyle().
		Foreground(accentHover).
		Bold(true).
		Background(cardBg).
		PaddingLeft(2).
		PaddingRight(2).
		MarginLeft(0)

	itemStyle = lipgloss.NewStyle().
		Foreground(textSecondary).
		PaddingLeft(2)

	helpStyle = lipgloss.NewStyle().
		Foreground(textMuted).
		Italic(true).
		MarginTop(1)

	successStyle = lipgloss.NewStyle().
		Foreground(successColor).
		Bold(true)

	errorStyle = lipgloss.NewStyle().
		Foreground(errorColor).
		Bold(true)

	warningStyle = lipgloss.NewStyle().
		Foreground(warningColor).
		Bold(true)

	infoStyle = lipgloss.NewStyle().
		Foreground(infoColor).
		Bold(true)

	accentStyle = lipgloss.NewStyle().
		Foreground(accentPrimary).
		Bold(true)

	dimStyle = lipgloss.NewStyle().
		Foreground(textDim)

	spinnerStyle = lipgloss.NewStyle().
		Foreground(textMuted).
		Bold(true)

	outputBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Background(cardBg).
		Padding(1, 2).
		Width(82).
		Height(12).
		Foreground(textSecondary)
	
	breadcrumbStyle = lipgloss.NewStyle().
		Foreground(textMuted)
	
	breadcrumbActiveStyle = lipgloss.NewStyle().
		Foreground(textSecondary).
		Bold(true)
	
	statusBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderAccent).
		Padding(0, 2).
		Foreground(textSecondary).
		MarginBottom(1)
	
	keyStyle = lipgloss.NewStyle().
		Foreground(textPrimary).
		Bold(true).
		Background(cardBg).
		Padding(0, 1)
	
	keyDescStyle = lipgloss.NewStyle().
		Foreground(textMuted)
)