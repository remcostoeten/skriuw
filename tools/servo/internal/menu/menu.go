package menu

import (
	"fmt"
	"path/filepath"
	"strings"

	"servo/internal/commands"
	"servo/internal/config"
	"servo/internal/kill"
)

type MenuType int

const (
	MenuTypeSubmenu MenuType = iota
	MenuTypeRunAction
	MenuTypeBuildAction
	MenuTypeDeployAction
	MenuTypeToolAction
	MenuTypeUtilityAction
	MenuTypeSettings
	MenuTypeConfigView
	MenuTypeConfigEdit
	MenuTypeConfigAdd
	MenuTypeConfigReset
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

type MenuContext struct {
	Title      string
	Items      []MenuItem
	Cursor     int
	ParentMenu *MenuContext
}

func BuildMainMenu(cfg *config.ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "Servo · Dev Launcher",
		Items: []MenuItem{
			{
				Name:       "Run Application",
				Icon:       "[RUN]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "run",
			},
			{
				Name:       "Build Application",
				Icon:       "[BUILD]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "build",
			},
			{
				Name:       "Deploy Application",
				Icon:       "[DEPLOY]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy",
			},
			{
				Name:       "Tools",
				Icon:       "[TOOLS]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "tools",
			},
			{
				Name:       "Process Dashboard",
				Icon:       "[STATUS]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "dashboard",
			},
			{
				Name:       "Settings",
				Icon:       "[SETTINGS]",
				Type:       MenuTypeSettings,
			},
			{
				Name:       "Configuration",
				Icon:       "[CONFIG]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "config",
			},
			{
				Name:       "Help & Docs",
				Icon:       "[HELP]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "help",
			},
			{
				Name: "Exit",
				Icon: "[EXIT]",
				Type: MenuTypeExit,
			},
		},
		Cursor: 0,
	}
}

func BuildSubmenu(parentItem MenuItem, cfg *config.ServoConfig) *MenuContext {
	switch parentItem.SubmenuKey {
	case "run":
		return BuildRunMenu(cfg)
	case "build":
		return BuildBuildMenu(cfg)
	case "deploy":
		return BuildDeployMenu(cfg)
	case "deploy-web":
		return BuildDeployWebMenu(cfg)
	case "deploy-docs":
		return BuildDeployDocsMenu(cfg)
	case "tools":
		return BuildToolsMenu(cfg)
	case "dashboard":
		return BuildDashboardMenu(cfg)
	case "help":
		return BuildHelpMenu(cfg)
	case "config":
		return BuildConfigMenu(cfg)
	default:
		return BuildMainMenu(cfg)
	}
}

func BuildRunMenu(cfg *config.ServoConfig) *MenuContext {
	items := []MenuItem{}

	// Dynamically build menu items from discovered apps
	for _, app := range cfg.Apps {
		if action := NewAction(app.DevCmd, filepath.Join(cfg.RootDir, app.Dir)); action != nil {
			icon := GetAppIcon(app.Name)
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
		Icon:          "[STOP]",
		Type:          MenuTypeUtilityAction,
		UtilityAction: kill.KillDevProcesses,
	})

	items = append(items, MenuItem{
		Name: "Back",
		Icon: "[BACK]",
		Type: MenuTypeSubmenu,
	})

	return &MenuContext{
		Title: "Run Application",
		Items: items,
	}
}

func BuildBuildMenu(cfg *config.ServoConfig) *MenuContext {
	items := []MenuItem{}

	// Dynamically build menu items from discovered apps
	for _, app := range cfg.Apps {
		if action := NewAction(app.BuildCmd, filepath.Join(cfg.RootDir, app.Dir)); action != nil {
			icon := GetAppIcon(app.Name)
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
		Name: "Back",
		Icon: "[BACK]",
		Type: MenuTypeSubmenu,
	})

	return &MenuContext{
		Title: "Build Application",
		Items: items,
	}
}

func BuildDeployMenu(cfg *config.ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "Deploy Application",
		Items: []MenuItem{
			{
				Name:       "Deploy Web",
				Icon:       "[WEB]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy-web",
			},
			{
				Name:       "Deploy Docs",
				Icon:       "[DOCS]",
				Type:       MenuTypeSubmenu,
				SubmenuKey: "deploy-docs",
			},
			{
				Name: "Back",
				Icon: "[BACK]",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func BuildDeployWebMenu(cfg *config.ServoConfig) *MenuContext {
	appDir := filepath.Join(cfg.RootDir, "apps/web")

	return &MenuContext{
		Title: "Deploy Web",
		Items: []MenuItem{
			{
				Name: "Staging",
				Icon: "[STAGE]",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy"},
					WorkDir: appDir,
				},
			},
			{
				Name: "Production",
				Icon: "[PROD]",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy", "--prod"},
					WorkDir: appDir,
				},
			},
			{
				Name: "Back",
				Icon: "[BACK]",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func BuildDeployDocsMenu(cfg *config.ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "Deploy Docs",
		Items: []MenuItem{
			{
				Name: "Staging",
				Icon: "[STAGE]",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy"},
					WorkDir: filepath.Join(cfg.RootDir, "apps/docs"),
				},
			},
			{
				Name: "Production",
				Icon: "[PROD]",
				Type: MenuTypeDeployAction,
				Action: &Action{
					Command: "vercel",
					Args:    []string{"deploy", "--prod"},
					WorkDir: filepath.Join(cfg.RootDir, "apps/docs"),
				},
			},
			{
				Name: "Back",
				Icon: "[BACK]",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func NewAction(cmd []string, workDir string) *Action {
	if len(cmd) == 0 {
		return nil
	}

	return &Action{
		Command: cmd[0],
		Args:    cmd[1:],
		WorkDir: workDir,
	}
}

func BuildToolsMenu(cfg *config.ServoConfig) *MenuContext {
	items := []MenuItem{}

	// Dynamically build menu items from discovered tools
	for _, tool := range cfg.Tools {
		if action := NewAction(tool.Command, filepath.Join(cfg.RootDir, tool.Dir)); action != nil {
			icon := GetToolIcon(tool.Name)
			items = append(items, MenuItem{
				Name:   tool.Name,
				Icon:   icon,
				Type:   MenuTypeToolAction,
				Action: action,
			})
		}
	}

	if len(items) == 0 {
		items = append(items, MenuItem{
			Name: "No tools found",
			Icon: "[INFO]",
			Type: MenuTypeUtilityAction,
		})
	}

	items = append(items, MenuItem{
		Name: "Back",
		Icon: "[BACK]",
		Type: MenuTypeSubmenu,
	})

	return &MenuContext{
		Title: "Tools",
		Items: items,
	}
}

func GetAppIcon(appName string) string {
	name := strings.ToLower(appName)

	// Icon selection based on app name patterns
	if strings.Contains(name, "tauri") {
		return "[TAURI]"
	}
	if strings.Contains(name, "doc") {
		return "[DOCS]"
	}
	if strings.Contains(name, "web") || strings.Contains(name, "app") {
		return "[WEB]"
	}

	// Default icon
	return "[APP]"
}

func GetToolIcon(toolName string) string {
	name := strings.ToLower(toolName)

	// Icon selection based on tool name patterns
	if strings.Contains(name, "seed") {
		return "[SEED]"
	}
	if strings.Contains(name, "cli") {
		return "[CLI]"
	}

	// Default tool icon
	return "[TOOL]"
}

func BuildDashboardMenu(cfg *config.ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "Process Dashboard",
		Items: []MenuItem{
			{
				Name: "View Dashboard",
				Icon: "[VIEW]",
				Type: MenuTypeUtilityAction,
			},
			{
				Name: "Back",
				Icon: "[BACK]",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func BuildConfigMenu(cfg *config.ServoConfig) *MenuContext {
	return &MenuContext{
		Title: "Configuration",
		Items: []MenuItem{
			{
				Name: "View Config",
				Icon: "[VIEW]",
				Type: MenuTypeConfigView,
			},
			{
				Name: "Edit Configuration",
				Icon: "[EDIT]",
				Type: MenuTypeConfigEdit,
			},
			{
				Name: "Add App",
				Icon: "[ADD]",
				Type: MenuTypeConfigAdd,
			},
			{
				Name: "Reset Config",
				Icon: "[RESET]",
				Type: MenuTypeConfigReset,
			},
			{
				Name: "Back",
				Icon: "[BACK]",
				Type: MenuTypeSubmenu,
			},
		},
	}
}

func BuildHelpMenu(cfg *config.ServoConfig) *MenuContext {
	items := []MenuItem{
		{
			Name:          "CLI Usage & Arguments",
			Icon:          "[USAGE]",
			Type:          MenuTypeUtilityAction,
			UtilityAction: commands.ShowUsageSummary,
		},
		{
			Name:          "Project Links",
			Icon:          "[LINK]",
			Type:          MenuTypeUtilityAction,
			UtilityAction: commands.ShowProjectLinks,
		},
		{
			Name: "Back",
			Icon: "[BACK]",
			Type: MenuTypeSubmenu,
		},
	}

	return &MenuContext{
		Title: "Help & Resources",
		Items: items,
	}
}
