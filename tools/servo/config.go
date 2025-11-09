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

	// Auto-detect project structure
	structure, err := detectProjectStructure(rootDir)
	if err != nil {
		// Fallback to empty config if detection fails
		return &ServoConfig{
			ProjectName: "Servo",
			RootDir:     rootDir,
			GitHubRepo:  "",
			Apps:        make(map[string]AppConfig),
		}
	}

	// Convert discovered apps to AppConfig map
	apps := make(map[string]AppConfig)
	for _, discoveredApp := range structure.Apps {
		apps[discoveredApp.Key] = AppConfig{
			Name:     discoveredApp.Name,
			Dir:      discoveredApp.Dir,
			DevCmd:   discoveredApp.DevCmd,
			BuildCmd: discoveredApp.BuildCmd,
		}
	}

	// Try to extract GitHub repo from package.json
	githubRepo := ""
	if structure.RootPackage != nil {
		// Could parse repository field from package.json if needed
		// For now, keep it empty or try to detect from git remote
		githubRepo = detectGitHubRepo(rootDir)
	}

	projectName := "Servo"
	if structure.RootPackage != nil && structure.RootPackage.Name != "" {
		projectName = structure.RootPackage.Name
	}

	return &ServoConfig{
		ProjectName: projectName,
		RootDir:     rootDir,
		GitHubRepo:  githubRepo,
		Apps:        apps,
	}
}

func resolveRootDir() string {
	// First, try from executable path (if running as installed binary)
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		if root := searchUpForPackageJSON(exeDir); root != "" {
			return root
		}
	}

	// Then, try from current working directory
	if wd, err := os.Getwd(); err == nil {
		if root := searchUpForPackageJSON(wd); root != "" {
			return root
		}
	}

	// Fallback to current directory
	return "."
}

// searchUpForPackageJSON searches up the directory tree until it finds a package.json
// or reaches the filesystem root
func searchUpForPackageJSON(startPath string) string {
	current := filepath.Clean(startPath)

	for {
		if isRepoRoot(current) {
			return current
		}

		parent := filepath.Dir(current)
		// Stop if we've reached the filesystem root (parent == current)
		if parent == current {
			break
		}
		current = parent
	}

	return ""
}

func isRepoRoot(path string) bool {
	if path == "" {
		return false
	}

	// Check for package.json (Node.js project)
	if _, err := os.Stat(filepath.Join(path, "package.json")); err == nil {
		return true
	}

	return false
}

func detectGitHubRepo(rootDir string) string {
	// Try to read .git/config or use git command
	// For now, return empty - can be enhanced later
	return ""
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}
