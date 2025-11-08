package main

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Colors
	primaryColor   = lipgloss.Color("#7C3AED")
	secondaryColor = lipgloss.Color("#06B6D4")
	successColor   = lipgloss.Color("#10B981")
	warningColor   = lipgloss.Color("#F59E0B")
	errorColor     = lipgloss.Color("#EF4444")
	infoColor      = lipgloss.Color("#3B82F6")
	accentColor    = lipgloss.Color("#EC4899")
	textColor      = lipgloss.Color("#E5E7EB")
	dimColor       = lipgloss.Color("#6B7280")

	// Styles
	boxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 3).
		Width(90)

	titleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Underline(true).
		MarginBottom(1)

	selectedItemStyle = lipgloss.NewStyle().
		Foreground(primaryColor).
		Bold(true).
		Background(lipgloss.Color("#2D1B5E")).
		PaddingLeft(1).
		PaddingRight(1)

	itemStyle = lipgloss.NewStyle().
		Foreground(textColor)

	helpStyle = lipgloss.NewStyle().
		Foreground(dimColor).
		Italic(true)

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
		Foreground(accentColor).
		Bold(true)

	dimStyle = lipgloss.NewStyle().
		Foreground(dimColor)

	spinnerStyle = lipgloss.NewStyle().
		Foreground(primaryColor).
		Bold(true)

	outputBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		BorderForeground(dimColor).
		Padding(1).
		Width(84).
		Height(12).
		Foreground(textColor)
)