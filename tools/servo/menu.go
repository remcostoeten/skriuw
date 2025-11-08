package main

import (
	"fmt"
	"path/filepath"
)

type MenuType int

const (
	MenuTypeSubmenu MenuType = iota
	MenuTypeRunAction
	MenuTypeBuildAction
	MenuTypeDeployAction
	MenuTypeExit
)

type MenuItem struct {
	Name       string
	Icon       string
	Type       MenuType
	SubmenuKey string
	Action     *Action
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

	if app, ok := config.Apps["instantdb"]; ok {
		if action := newAction(app.DevCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Run %s", app.Name),
				Icon:   "🌐",
				Type:   MenuTypeRunAction,
				Action: action,
			})
		}
	}

	if app, ok := config.Apps["tauri"]; ok {
		if action := newAction(app.DevCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Run %s", app.Name),
				Icon:   "⚡",
				Type:   MenuTypeRunAction,
				Action: action,
			})
		}
	}

	if app, ok := config.Apps["docs"]; ok {
		if action := newAction(app.DevCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Run %s", app.Name),
				Icon:   "📚",
				Type:   MenuTypeRunAction,
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
		Title: "🚀 Run Application",
		Items: items,
	}
}

func buildBuildMenu(config *ServoConfig) *MenuContext {
	items := []MenuItem{}

	if app, ok := config.Apps["instantdb"]; ok {
		if action := newAction(app.BuildCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Build %s", app.Name),
				Icon:   "🌐",
				Type:   MenuTypeBuildAction,
				Action: action,
			})
		}
	}

	if app, ok := config.Apps["tauri"]; ok {
		if action := newAction(app.BuildCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Compile %s", app.Name),
				Icon:   "⚡",
				Type:   MenuTypeBuildAction,
				Action: action,
			})
		}
	}

	if app, ok := config.Apps["docs"]; ok {
		if action := newAction(app.BuildCmd, filepath.Join(config.RootDir, app.Dir)); action != nil {
			items = append(items, MenuItem{
				Name:   fmt.Sprintf("Build %s", app.Name),
				Icon:   "📚",
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
	appDir := filepath.Join(config.RootDir, "apps/instantdb")

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
