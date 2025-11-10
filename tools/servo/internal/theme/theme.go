package theme

import "github.com/charmbracelet/lipgloss"

// ThemeName represents the name of a theme
type ThemeName string

const (
	ThemeDarkMonochrome ThemeName = "dark-monochrome"
	ThemeCatppuccin     ThemeName = "catppuccin"
	ThemeJackolantern   ThemeName = "jackolantern"
)

// Theme represents a color theme
type Theme struct {
	Name        ThemeName
	DisplayName string
	Description string

	// Background colors
	BgColor      lipgloss.Color
	CardBg       lipgloss.Color
	BorderColor  lipgloss.Color
	BorderAccent lipgloss.Color

	// Text colors
	TextPrimary   lipgloss.Color
	TextSecondary lipgloss.Color
	TextMuted     lipgloss.Color
	TextDim       lipgloss.Color

	// Accent colors
	AccentPrimary lipgloss.Color
	AccentHover   lipgloss.Color

	// Status colors
	SuccessColor lipgloss.Color
	WarningColor lipgloss.Color
	ErrorColor   lipgloss.Color
	InfoColor    lipgloss.Color
}

// AvailableThemes returns all available themes
func AvailableThemes() []Theme {
	return []Theme{
		DarkMonochromeTheme(),
		CatppuccinTheme(),
		JackolanternTheme(),
	}
}

// GetTheme returns a theme by name, or the default theme if not found
func GetTheme(name ThemeName) Theme {
	for _, theme := range AvailableThemes() {
		if theme.Name == name {
			return theme
		}
	}
	return DarkMonochromeTheme()
}

// DarkMonochromeTheme returns the dark monochrome theme
func DarkMonochromeTheme() Theme {
	return Theme{
		Name:        ThemeDarkMonochrome,
		DisplayName: "Dark Monochrome",
		Description: "Near-black with subtle gray accents",

		// Almost pure black with subtle grays
		BgColor:      lipgloss.Color("#0a0a0a"),
		CardBg:       lipgloss.Color("#121212"),
		BorderColor:  lipgloss.Color("#1a1a1a"),
		BorderAccent: lipgloss.Color("#2a2a2a"),

		// Minimal color, mostly grayscale
		TextPrimary:   lipgloss.Color("#e8e8e8"),
		TextSecondary: lipgloss.Color("#c0c0c0"),
		TextMuted:     lipgloss.Color("#8a8a8a"),
		TextDim:       lipgloss.Color("#5a5a5a"),

		// Very subtle accents
		AccentPrimary: lipgloss.Color("#d0d0d0"),
		AccentHover:   lipgloss.Color("#f0f0f0"),

		// Muted status colors that fit the monochrome aesthetic
		SuccessColor: lipgloss.Color("#6b8e6b"),
		WarningColor: lipgloss.Color("#8e8e6b"),
		ErrorColor:   lipgloss.Color("#8e6b6b"),
		InfoColor:    lipgloss.Color("#6b7a8e"),
	}
}

// CatppuccinTheme returns the Catppuccin Mocha theme
func CatppuccinTheme() Theme {
	return Theme{
		Name:        ThemeCatppuccin,
		DisplayName: "Catppuccin Mocha",
		Description: "Soothing pastel theme for the high-spirited",

		// Catppuccin Mocha base colors
		BgColor:      lipgloss.Color("#1e1e2e"), // Base
		CardBg:       lipgloss.Color("#181825"), // Mantle
		BorderColor:  lipgloss.Color("#313244"), // Surface0
		BorderAccent: lipgloss.Color("#45475a"), // Surface1

		// Catppuccin text colors
		TextPrimary:   lipgloss.Color("#cdd6f4"), // Text
		TextSecondary: lipgloss.Color("#bac2de"), // Subtext1
		TextMuted:     lipgloss.Color("#a6adc8"), // Subtext0
		TextDim:       lipgloss.Color("#7f849c"), // Overlay2

		// Catppuccin accent colors
		AccentPrimary: lipgloss.Color("#89b4fa"), // Blue
		AccentHover:   lipgloss.Color("#b4befe"), // Lavender

		// Catppuccin status colors
		SuccessColor: lipgloss.Color("#a6e3a1"), // Green
		WarningColor: lipgloss.Color("#f9e2af"), // Yellow
		ErrorColor:   lipgloss.Color("#f38ba8"), // Red
		InfoColor:    lipgloss.Color("#89dceb"), // Sky
	}
}

// JackolanternTheme returns the Jack-o'-Lantern autumn theme
func JackolanternTheme() Theme {
	return Theme{
		Name:        ThemeJackolantern,
		DisplayName: "Jack-o'-Lantern",
		Description: "Warm autumn oranges with dark shadows",

		// Dark autumn backgrounds
		BgColor:      lipgloss.Color("#0f0a08"), // Very dark brown-black
		CardBg:       lipgloss.Color("#1a0f0a"), // Dark brown
		BorderColor:  lipgloss.Color("#2d1810"), // Dark burnt orange
		BorderAccent: lipgloss.Color("#3d2415"), // Medium burnt orange

		// Warm text colors
		TextPrimary:   lipgloss.Color("#f5dcc4"), // Warm cream
		TextSecondary: lipgloss.Color("#e8c5a0"), // Light pumpkin
		TextMuted:     lipgloss.Color("#c89b6f"), // Muted orange
		TextDim:       lipgloss.Color("#8b6f47"), // Dark tan

		// Orange accent colors
		AccentPrimary: lipgloss.Color("#ff9933"), // Bright pumpkin orange
		AccentHover:   lipgloss.Color("#ffb366"), // Light pumpkin

		// Fall-themed status colors
		SuccessColor: lipgloss.Color("#c9a86a"), // Golden harvest
		WarningColor: lipgloss.Color("#ff8c42"), // Warm orange
		ErrorColor:   lipgloss.Color("#c9594f"), // Muted red
		InfoColor:    lipgloss.Color("#8b7355"), // Autumn brown
	}
}

