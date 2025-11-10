package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// UserPreferences stores user-specific settings
type UserPreferences struct {
	Theme string `json:"theme"` // Theme name (e.g., "dark-monochrome", "catppuccin", "jackolantern")
}

// GetPreferencesPath returns the path to the preferences file
func GetPreferencesPath(rootDir string) string {
	servoDir := filepath.Join(rootDir, ".servo")
	return filepath.Join(servoDir, "preferences.json")
}

// LoadPreferences loads user preferences from disk
func LoadPreferences(rootDir string) *UserPreferences {
	prefsPath := GetPreferencesPath(rootDir)

	// Check if file exists
	data, err := os.ReadFile(prefsPath)
	if err != nil {
		// Return default preferences if file doesn't exist
		return &UserPreferences{
			Theme: "dark-monochrome", // Default theme
		}
	}

	var prefs UserPreferences
	if err := json.Unmarshal(data, &prefs); err != nil {
		// Return default preferences if JSON is invalid
		return &UserPreferences{
			Theme: "dark-monochrome",
		}
	}

	return &prefs
}

// SavePreferences saves user preferences to disk
func SavePreferences(rootDir string, prefs *UserPreferences) error {
	prefsPath := GetPreferencesPath(rootDir)

	// Ensure .servo directory exists
	servoDir := filepath.Dir(prefsPath)
	if err := os.MkdirAll(servoDir, 0755); err != nil {
		return err
	}

	// Marshal to JSON with pretty printing
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}

	// Write to file
	return os.WriteFile(prefsPath, data, 0644)
}

