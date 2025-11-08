package main

import "path/filepath"

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
	webApp := config.Apps["web"]
	tauriApp := config.Apps["tauri"]
	docsApp := config.Apps["docs"]

	return &MenuContext{
		Title: "🚀 Run Application",
		Items: []MenuItem{
			{
				Name:   "Run Web",
				Icon:   "🌐",
				Type:   MenuTypeRunAction,
				Action: newAction(webApp.DevCmd, filepath.Join(config.RootDir, webApp.Dir)),
			},
			{
				Name:   "Run Tauri",
				Icon:   "⚡",
				Type:   MenuTypeRunAction,
				Action: newAction(tauriApp.DevCmd, filepath.Join(config.RootDir, tauriApp.Dir)),
			},
			{
				Name:   "Run Docs",
				Icon:   "📚",
				Type:   MenuTypeRunAction,
				Action: newAction(docsApp.DevCmd, filepath.Join(config.RootDir, docsApp.Dir)),
			},
			{
				Name: "← Back",
				Icon: "↩️",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func buildBuildMenu(config *ServoConfig) *MenuContext {
	webApp := config.Apps["web"]
	tauriApp := config.Apps["tauri"]
	docsApp := config.Apps["docs"]

	return &MenuContext{
		Title: "🔨 Build Application",
		Items: []MenuItem{
			{
				Name:   "Build Web",
				Icon:   "🌐",
				Type:   MenuTypeBuildAction,
				Action: newAction(webApp.BuildCmd, filepath.Join(config.RootDir, webApp.Dir)),
			},
			{
				Name:   "Compile Tauri",
				Icon:   "⚡",
				Type:   MenuTypeBuildAction,
				Action: newAction(tauriApp.BuildCmd, filepath.Join(config.RootDir, tauriApp.Dir)),
			},
			{
				Name:   "Build Docs",
				Icon:   "📚",
				Type:   MenuTypeBuildAction,
				Action: newAction(docsApp.BuildCmd, filepath.Join(config.RootDir, docsApp.Dir)),
			},
			{
				Name: "← Back",
				Icon: "↩️",
				Type: MenuTypeSubmenu,
			},
		},
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
					WorkDir: filepath.Join(config.RootDir, "apps/instantdb"),
				},
			},
			{
				Name: "Production",
				Icon: "🚀",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy", "--prod"},
					WorkDir: filepath.Join(config.RootDir, "apps/instantdb"),
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
