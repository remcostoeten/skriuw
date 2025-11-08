package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

func openBrowser(port string) tea.Cmd {
	return func() tea.Msg {
		url := fmt.Sprintf("http://localhost:%s", port)
		var cmd *exec.Cmd

		switch runtime.GOOS {
		case "darwin":
			cmd = exec.Command("open", url)
		case "linux":
			cmd = exec.Command("xdg-open", url)
		case "windows":
			cmd = exec.Command("cmd", "/c", "start", url)
		}

		if cmd != nil {
			cmd.Run()
		}

		return serverOutputMsg(fmt.Sprintf("✓ Opening %s in browser", url))
	}
}

func openGitHubRepo(repo string) tea.Cmd {
	return func() tea.Msg {
		if repo == "" {
			return serverOutputMsg("✗ No GitHub repo configured")
		}

		url := repo
		if !strings.HasPrefix(url, "http") {
			url = "https://github.com/" + url
		}

		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			cmd = exec.Command("open", url)
		case "linux":
			cmd = exec.Command("xdg-open", url)
		case "windows":
			cmd = exec.Command("cmd", "/c", "start", url)
		}

		if cmd != nil {
			cmd.Run()
		}

		return serverOutputMsg("✓ Opening GitHub repo")
	}
}

func promptInstallPackage(packageManager string, workDir string) tea.Cmd {
	return func() tea.Msg {
		fmt.Print("\n\n📦 Package to install: ")
		reader := bufio.NewReader(os.Stdin)
		packageName, _ := reader.ReadString('\n')
		packageName = strings.TrimSpace(packageName)

		if packageName == "" {
			return serverOutputMsg("✗ Installation cancelled")
		}

		cmd := exec.Command(packageManager, "install", packageName)
		cmd.Dir = workDir
		output, err := cmd.CombinedOutput()

		if err != nil {
			return serverOutputMsg(fmt.Sprintf("✗ Failed to install %s: %s", packageName, string(output)))
		}

		return serverOutputMsg(fmt.Sprintf("✓ Installed %s successfully", packageName))
	}
}
