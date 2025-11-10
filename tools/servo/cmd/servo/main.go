package main

import (
	"fmt"
	"os"
	"os/exec"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/app"
	"servo/internal/config"
)

const Version = "0.1.0"

func main() {
	cfg := config.LoadServoConfig()

	// Handle command-line arguments
	if len(os.Args) > 1 {
		command := os.Args[1]
		switch command {
		case "dev":
			// Run dev directly without menu
			runDevDirect(cfg)
			return
		case "help", "-h", "--help":
			printHelp()
			return
		case "version", "--version", "-v":
			fmt.Println(Version)
			return
		}
	}

	// Default: show interactive menu
	p := tea.NewProgram(
		app.InitialModel(cfg),
		tea.WithAltScreen(),
	)

	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}

func runDevDirect(cfg *config.ServoConfig) {
	// Run bun run dev:direct from root
	cmd := exec.Command("bun", "run", "dev:direct")
	cmd.Dir = cfg.RootDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	fmt.Printf("🚀 Running dev server...\n\n")
	if err := cmd.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println("Servo - Development Launcher")
	fmt.Println("")
	fmt.Println("Usage:")
	fmt.Println("  servo           Show interactive menu")
	fmt.Println("  servo dev       Run dev server directly (no menu)")
	fmt.Println("  servo version   Show current version")
	fmt.Println("  servo help      Show this help message")
	fmt.Println("")
}

