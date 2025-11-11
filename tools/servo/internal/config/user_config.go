package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const (
	userConfigDirName  = "servo"
	userConfigFileName = "servo.config.json"
)

// UserConfig represents the persisted user configuration structure.
type UserConfig struct {
	Servo ServoUserConfig `json:"servo"`
}

// ServoUserConfig holds Servo-specific configuration values.
type ServoUserConfig struct {
	ProjectName string                     `json:"projectName"`
	GithubRepo  string                     `json:"githubRepo"`
	Apps        map[string]UserAppConfig   `json:"apps"`
	Tools       map[string]UserToolConfig  `json:"tools"`
}

// UserAppConfig represents configuration overrides for an app entry.
type UserAppConfig struct {
	Name  string   `json:"name,omitempty"`
	Dir   string   `json:"dir,omitempty"`
	Dev   []string `json:"dev,omitempty"`
	Build []string `json:"build,omitempty"`
	Port  int      `json:"port,omitempty"`
}

// UserToolConfig represents configuration overrides for a tool entry.
type UserToolConfig struct {
	Name    string   `json:"name,omitempty"`
	Dir     string   `json:"dir,omitempty"`
	Command []string `json:"command,omitempty"`
}

// UserConfigPath returns the expected location of the user's servo configuration file.
func UserConfigPath() string {
	if configDir, err := os.UserConfigDir(); err == nil && configDir != "" {
		return filepath.Join(configDir, userConfigDirName, userConfigFileName)
	}

	if homeDir, err := os.UserHomeDir(); err == nil && homeDir != "" {
		return filepath.Join(homeDir, ".config", userConfigDirName, userConfigFileName)
	}

	return filepath.Join(".config", userConfigDirName, userConfigFileName)
}

// UserConfigExists reports whether a user-level servo configuration file already exists.
func UserConfigExists() bool {
	if info, err := os.Stat(UserConfigPath()); err == nil && !info.IsDir() {
		return true
	}

	return false
}

// DefaultUserConfig returns the default configuration structure.
func DefaultUserConfig() UserConfig {
	return UserConfig{
		Servo: ServoUserConfig{
			ProjectName: "",
			GithubRepo:  "",
			Apps:        make(map[string]UserAppConfig),
			Tools:       make(map[string]UserToolConfig),
		},
	}
}

// BootstrapUserConfig ensures that a default user configuration file exists on disk.
func BootstrapUserConfig() error {
	if UserConfigExists() {
		return nil
	}

	cfg := DefaultUserConfig()
	return SaveUserConfig(cfg)
}

// LoadUserConfig loads the user configuration from disk, returning defaults if missing.
func LoadUserConfig() (UserConfig, error) {
	cfg := DefaultUserConfig()

	configPath := UserConfigPath()
	data, err := os.ReadFile(configPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}

	cfg.ensureMaps()
	return cfg, nil
}

// SaveUserConfig writes the provided configuration back to disk.
func SaveUserConfig(cfg UserConfig) error {
	cfg.ensureMaps()

	configPath := UserConfigPath()
	configDir := filepath.Dir(configPath)

	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, append(data, '\n'), 0o644)
}

// AddOrUpdateAppConfig merges the provided app configuration into the user config and saves it.
func AddOrUpdateAppConfig(key, name, dir string, dev []string) error {
	cfg, err := LoadUserConfig()
	if err != nil {
		return err
	}

	cfg.ensureMaps()

	if cfg.Servo.Apps == nil {
		cfg.Servo.Apps = make(map[string]UserAppConfig)
	}

	cfg.Servo.Apps[key] = UserAppConfig{
		Name: name,
		Dir:  dir,
		Dev:  dev,
	}

	return SaveUserConfig(cfg)
}

// ResetUserConfig resets the user configuration to defaults, creating a backup first.
// Keeps only the last 2 backups.
func ResetUserConfig() error {
	configPath := UserConfigPath()
	configDir := filepath.Dir(configPath)

	// Create backup if config exists
	if UserConfigExists() {
		timestamp := time.Now().Format("20060102-150405")
		backupPath := filepath.Join(configDir, fmt.Sprintf("%s.backup.%s", userConfigFileName, timestamp))

		currentConfig, err := os.ReadFile(configPath)
		if err != nil {
			return fmt.Errorf("failed to read config for backup: %w", err)
		}

		if err := os.WriteFile(backupPath, currentConfig, 0o644); err != nil {
			return fmt.Errorf("failed to create backup: %w", err)
		}

		if err := cleanupOldBackups(configDir); err != nil {
			// Do not fail if cleanup fails; just log silently
			_ = err
		}
	}

	return SaveUserConfig(DefaultUserConfig())
}

// cleanupOldBackups removes all but the 2 most recent backup files.
func cleanupOldBackups(configDir string) error {
	pattern := filepath.Join(configDir, fmt.Sprintf("%s.backup.*", userConfigFileName))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return err
	}

	if len(matches) <= 2 {
		return nil
	}

	sort.Slice(matches, func(i, j int) bool {
		infoI, errI := os.Stat(matches[i])
		infoJ, errJ := os.Stat(matches[j])
		if errI != nil || errJ != nil {
			return false
		}
		return infoI.ModTime().After(infoJ.ModTime())
	})

	for i := 2; i < len(matches); i++ {
		_ = os.Remove(matches[i])
	}

	return nil
}

// ensureMaps guarantees the servo config maps are initialised.
func (cfg *UserConfig) ensureMaps() {
	if cfg.Servo.Apps == nil {
		cfg.Servo.Apps = make(map[string]UserAppConfig)
	}
	if cfg.Servo.Tools == nil {
		cfg.Servo.Tools = make(map[string]UserToolConfig)
	}
}
