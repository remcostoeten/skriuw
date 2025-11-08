package main

import (
	"os"
	"path/filepath"
)

type ServoConfig struct {
	ProjectName string
	RootDir     string
	GitHubRepo  string
	Apps        map[string]AppConfig
}

type AppConfig struct {
	Name     string
	Dir      string
	DevCmd   []string
	BuildCmd []string
}

func LoadServoConfig() *ServoConfig {
	rootDir := resolveRootDir()

	return &ServoConfig{
		ProjectName: "Servo",
		RootDir:     rootDir,
		GitHubRepo:  "skriuw-dev/skriuw",
		Apps: map[string]AppConfig{
			"instantdb": {
				Name:     "InstantDB App",
				Dir:      "apps/instantdb",
				DevCmd:   []string{"bun", "run", "dev"},
				BuildCmd: []string{"bun", "run", "build"},
			},
			"tauri": {
				Name:     "InstantDB Tauri",
				Dir:      "apps/instantdb",
				DevCmd:   []string{"bun", "run", "tauri", "dev"},
				BuildCmd: []string{"bun", "run", "tauri", "build"},
			},
			"docs": {
				Name:     "Documentation",
				Dir:      "apps/docs",
				DevCmd:   []string{"bun", "run", "dev"},
				BuildCmd: []string{"bun", "run", "build"},
			},
		},
	}
}

func resolveRootDir() string {
	if exePath, err := os.Executable(); err == nil {
		if root := filepath.Clean(filepath.Join(filepath.Dir(exePath), "..", "..")); isRepoRoot(root) {
			return root
		}
	}

	if wd, err := os.Getwd(); err == nil {
		candidates := []string{
			wd,
			filepath.Join(wd, ".."),
			filepath.Join(wd, "..", ".."),
		}

		for _, candidate := range candidates {
			if isRepoRoot(candidate) {
				return filepath.Clean(candidate)
			}
		}
	}

	return "."
}

func isRepoRoot(path string) bool {
	if path == "" {
		return false
	}

	required := []string{
		filepath.Join(path, "apps"),
		filepath.Join(path, "tools"),
	}

	for _, dir := range required {
		if !dirExists(dir) {
			return false
		}
	}

	return true
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}
