package main

import (
	"fmt"
	"path/filepath"
	"strings"
)

type MenuType int

const (
	MenuTypeSubmenu MenuType = iota
	MenuTypeRunAction
	MenuTypeBuildAction
	MenuTypeDeployAction
	MenuTypeUtilityAction
	MenuTypeExit
)

type MenuItem struct {
	Name          string
	Icon          string
	Type          MenuType
	SubmenuKey    string
	Action        *Action
	UtilityAction func() (string, error)
}

type Action struct {
	Command string
	Args    []string
	WorkDir string
}

func buildMainMenu(config *ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "🎯 Servo - Dev Launcher",
		Items: []MenuItem{
			{
				Name:       "Run Application",
				Icon:       "🚀",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "run",
			},
			{
				Name:       "Build Application",
				Icon:       "🔨",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "build",
			},
			{
				Name:       "Deploy Application",
				Icon:       "🌐",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy",
			},
			{
				Name: "Exit",
				Icon: "❌",
				Type: MenuTypeExit,
			},
		},
		Cursor: 0,
	}
}

func buildSubmenu(parentItem MenuItem, config *ServoConfig) *MenuContext {
	switch parentItem.SubmenuKey {
	case "run":
		return buildRunMenu(config)
	case "build":
		return buildBuildMenu(config)
	case "deploy":
		return buildDeployMenu(config)
	case "deploy-web":
		return buildDeployWebMenu(config)
	case "deploy-docs":
		return buildDeployDocsMenu(config)
	default:
		return buildMainMenu(config)
	}
}

func buildRunMenu(config *ServoConfig) *MenuContext {
	items := []MenuItem{}

	// Dynamically build menu items from discovered apps
	for _, app := range config.Apps {
		if action := newAction(app.DevCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			icon := getAppIcon(app.Name)
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Run %s", app.Name),
				Icon:   icon,
				Type:   MenuTypeRunAction,
				Action: action,
			})
		}
	}

	items = append(items, MenuItem{
		Name:          "Kill Dev Processes",
		Icon:          "🛑",
		Type:          MenuTypeUtilityAction,
		UtilityAction: killDevProcesses,
	})

	items = append(items, MenuItem{
		Name: "← Back",
		Icon: "↩️",
		Type: MenuTypeSubmenu,
	})

	return &MenuContext{
		Title: "🚀 Run Application",
		Items: items,
	}
}

func buildBuildMenu(config *ServoConfig) *MenuContext {
	items := []MenuItem{}

	// Dynamically build menu items from discovered apps
	for _, app := range config.Apps {
		if action := newAction(app.BuildCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			icon := getAppIcon(app.Name)
			verb := "Build"
			if strings.Contains(strings.ToLower(app.Name), "tauri") {
				verb = "Compile"
			}
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("%s %s", verb, app.Name),
				Icon:   icon,
				Type:   MenuTypeBuildAction,
				Action: action,
			})
		}
	}

	items = append(items, MenuItem{
		Name: "← Back",
		Icon: "↩️",
		Type: MenuTypeSubmenu,
	})

	return &MenuContext{
		Title: "🔨 Build Application",
		Items: items,
	}
}

func buildDeployMenu(config *ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "🌐 Deploy Application",
		Items: []MenuItem{
			{
				Name:       "Deploy Web",
				Icon:       "🌐",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy-web",
			},
			{
				Name:       "Deploy Docs",
				Icon:       "📚",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy-docs",
			},
			{
				Name: "← Back",
				Icon: "↩️",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func buildDeployWebMenu(config *ServoConfig) *MenuContext {
	appDir := filepath.Join(config.RootDir, "apps/web")

	return &MenuContext{
		Title: "🌐 Deploy Web",
		Items: []MenuItem{
			{
				Name: "Staging",
				Icon: "🧪",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy"},
					WorkDir: appDir,
				},
			},
			{
				Name: "Production",
				Icon: "🚀",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy", "--prod"},
					WorkDir: appDir,
				},
			},
			{
				Name: "← Back",
				Icon: "↩️",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func buildDeployDocsMenu(config *ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "📚 Deploy Docs",
		Items: []MenuItem{
			{
				Name: "Staging",
				Icon: "🧪",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy"},
					WorkDir: filepath.Join(config.RootDir, "apps/docs"),
				},
			},
			{
				Name: "Production",
				Icon: "🚀",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy", "--prod"},
					WorkDir: filepath.Join(config.RootDir, "apps/docs"),
				},
			},
			{
				Name: "← Back",
				Icon: "↩️",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func newAction(cmd []string, workDir string) *Action {
	if len(cmd) == 0 {
		return nil
	}

	return &Action{
		Command: cmd[0],
		Args:    cmd[1:],
		WorkDir: workDir,
	}
}

func getAppIcon(appName string) string {
	name := strings.ToLower(appName)

	// Icon selection based on app name patterns
	if strings.Contains(name, "tauri") {
		return "⚡"
	}
	if strings.Contains(name, "doc") {
		return "📚"
	}
	if strings.Contains(name, "web") || strings.Contains(name, "app") {
		return "🌐"
	}

	// Default icon
	return "🚀"
}
