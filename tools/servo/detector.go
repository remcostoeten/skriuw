package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type PackageJSON struct {
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Scripts        map[string]string `json:"scripts"`
	Workspaces     []string          `json:"workspaces"`
	PackageManager string            `json:"packageManager"`
	Private        bool              `json:"private"`
}

type ProjectStructure struct {
	IsMonorepo     bool
	PackageManager string
	RootPackage    *PackageJSON
	Apps           []DiscoveredApp
}

type DiscoveredApp struct {
	Key      string
	Name     string
	Dir      string
	DevCmd   []string
	BuildCmd []string
	Package  *PackageJSON
}

func detectProjectStructure(rootDir string) (*ProjectStructure, error) {
	rootPkg, err := readPackageJSON(filepath.Join(rootDir, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("failed to read root package.json: %w", err)
	}

	pm := detectPackageManager(rootDir, rootPkg)
	isMonorepo := detectMonorepo(rootDir, rootPkg)

	apps := []DiscoveredApp{}

	if isMonorepo {
		// Scan workspaces
		workspaceDirs := getWorkspaceDirectories(rootDir, rootPkg)
		for _, dir := range workspaceDirs {
			discoveredApps := discoverAppFromDir(rootDir, dir, pm)
			for _, app := range discoveredApps {
				if app != nil {
					apps = append(apps, *app)
				}
			}
		}
	} else {
		// Standalone project - check if root has dev script
		if rootPkg.Scripts != nil {
			if _, hasDev := rootPkg.Scripts["dev"]; hasDev {
				app := &DiscoveredApp{
					Key:      "app",
					Name:     getAppDisplayName(rootPkg),
					Dir:      ".",
					DevCmd:   []string{pm, "run", "dev"},
					BuildCmd: getBuildCmd(rootPkg, pm),
					Package:  rootPkg,
				}
				apps = append(apps, *app)
			}
		}
	}

	return &ProjectStructure{
		IsMonorepo:     isMonorepo,
		PackageManager: pm,
		RootPackage:    rootPkg,
		Apps:           apps,
	}, nil
}

func readPackageJSON(path string) (*PackageJSON, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var pkg PackageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, err
	}

	return &pkg, nil
}

func detectPackageManager(rootDir string, rootPkg *PackageJSON) string {
	// Check packageManager field first
	if rootPkg.PackageManager != "" {
		if strings.HasPrefix(rootPkg.PackageManager, "bun") {
			return "bun"
		}
		if strings.HasPrefix(rootPkg.PackageManager, "pnpm") {
			return "pnpm"
		}
		if strings.HasPrefix(rootPkg.PackageManager, "yarn") {
			return "yarn"
		}
		if strings.HasPrefix(rootPkg.PackageManager, "npm") {
			return "npm"
		}
	}

	// Check for lock files
	lockFiles := map[string]string{
		"bun.lockb":         "bun",
		"bun.lock":          "bun",
		"pnpm-lock.yaml":    "pnpm",
		"yarn.lock":         "yarn",
		"package-lock.json": "npm",
	}

	for lockFile, pm := range lockFiles {
		if _, err := os.Stat(filepath.Join(rootDir, lockFile)); err == nil {
			return pm
		}
	}

	// Default to npm
	return "npm"
}

func detectMonorepo(rootDir string, rootPkg *PackageJSON) bool {
	// Check for workspaces field
	if len(rootPkg.Workspaces) > 0 {
		return true
	}

	// Check for common monorepo directories
	monorepoDirs := []string{"apps", "packages"}
	for _, dir := range monorepoDirs {
		if dirExists(filepath.Join(rootDir, dir)) {
			return true
		}
	}

	return false
}

func getWorkspaceDirectories(rootDir string, rootPkg *PackageJSON) []string {
	dirs := []string{}

	// Parse workspace patterns
	for _, pattern := range rootPkg.Workspaces {
		// Remove trailing wildcard
		basePattern := strings.TrimSuffix(pattern, "/*")
		basePattern = strings.TrimSuffix(basePattern, "*")

		// Common patterns: "apps/*", "packages/*"
		if strings.Contains(pattern, "*") {
			baseDir := filepath.Join(rootDir, basePattern)
			if entries, err := os.ReadDir(baseDir); err == nil {
				for _, entry := range entries {
					if entry.IsDir() {
						dirs = append(dirs, filepath.Join(basePattern, entry.Name()))
					}
				}
			}
		} else {
			// Direct path
			dirs = append(dirs, pattern)
		}
	}

	// Fallback: scan common directories
	if len(dirs) == 0 {
		for _, commonDir := range []string{"apps", "packages"} {
			fullPath := filepath.Join(rootDir, commonDir)
			if entries, err := os.ReadDir(fullPath); err == nil {
				for _, entry := range entries {
					if entry.IsDir() {
						dirs = append(dirs, filepath.Join(commonDir, entry.Name()))
					}
				}
			}
		}
	}

	return dirs
}

func discoverAppFromDir(rootDir, relDir string, pm string) []*DiscoveredApp {
	fullPath := filepath.Join(rootDir, relDir)
	pkgPath := filepath.Join(fullPath, "package.json")

	pkg, err := readPackageJSON(pkgPath)
	if err != nil {
		return nil
	}

	// Only include packages with dev script
	if pkg.Scripts == nil {
		return nil
	}
	if _, hasDev := pkg.Scripts["dev"]; !hasDev {
		return nil
	}

	// Generate key from directory name
	key := filepath.Base(relDir)
	// Clean up key (remove @scope/ prefix if present)
	key = strings.TrimPrefix(key, "@")
	key = strings.Split(key, "/")[0]

	apps := []*DiscoveredApp{}

	// Main app
	app := &DiscoveredApp{
		Key:      key,
		Name:     getAppDisplayName(pkg),
		Dir:      relDir,
		DevCmd:   []string{pm, "run", "dev"},
		BuildCmd: getBuildCmd(pkg, pm),
		Package:  pkg,
	}
	apps = append(apps, app)

	// Tauri variant if available
	hasTauriDev := pkg.Scripts["tauri:dev"] != ""
	hasTauri := pkg.Scripts["tauri"] != ""
	hasTauriBuild := pkg.Scripts["tauri:build"] != ""

	if hasTauriDev || hasTauri {
		tauriCmd := "tauri:dev"
		if hasTauri {
			tauriCmd = "tauri"
		}

		var tauriBuildCmd []string
		if hasTauriBuild {
			tauriBuildCmd = []string{pm, "run", "tauri:build"}
		} else if hasTauri {
			// If just "tauri" script exists, try using it for build too
			tauriBuildCmd = []string{pm, "run", "tauri"}
		} else {
			// No build command available
			tauriBuildCmd = nil
		}

		tauriApp := &DiscoveredApp{
			Key:      key + "-tauri",
			Name:     getAppDisplayName(pkg) + " (Tauri)",
			Dir:      relDir,
			DevCmd:   []string{pm, "run", tauriCmd},
			BuildCmd: tauriBuildCmd,
			Package:  pkg,
		}
		apps = append(apps, tauriApp)
	}

	return apps
}

func getAppDisplayName(pkg *PackageJSON) string {
	if pkg.Name != "" {
		// Clean up scoped package names
		name := strings.TrimPrefix(pkg.Name, "@")
		parts := strings.Split(name, "/")
		if len(parts) > 1 {
			// Use the second part (e.g., "@skriuw/web" -> "Web")
			return capitalize(parts[1])
		}
		return capitalize(parts[0])
	}
	if pkg.Description != "" {
		return pkg.Description
	}
	return "App"
}

func capitalize(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func getBuildCmd(pkg *PackageJSON, pm string) []string {
	if pkg.Scripts != nil {
		if _, hasBuild := pkg.Scripts["build"]; hasBuild {
			return []string{pm, "run", "build"}
		}
	}
	return nil
}
