package main

import "path/filepath"

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
	rootDir, err := filepath.Abs("../..")
	if err != nil {
		rootDir = "../../"
	}

	return &ServoConfig{
		ProjectName: "Servo",
		RootDir:     rootDir,
		GitHubRepo:  "skriuw-dev/skriuw",
		Apps: map[string]AppConfig{
			"web": {
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
