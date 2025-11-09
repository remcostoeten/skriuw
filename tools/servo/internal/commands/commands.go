package commands

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"servo/internal/process"
)

func OpenBrowser(port string) tea.Cmd {
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

		return process.ServerOutputMsg(fmt.Sprintf("[info] Opening %s in browser", url))
	}
}

func OpenGitHubRepo(repo string) tea.Cmd {
	return func() tea.Msg {
		if repo == "" {
			return process.ServerOutputMsg("[error] no GitHub repo configured")
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

		return process.ServerOutputMsg("[info] Opening GitHub repo")
	}
}

func PromptInstallPackage(packageManager string, workDir string) tea.Cmd {
	return func() tea.Msg {
		fmt.Print("\n\nPackage to install: ")
		reader := bufio.NewReader(os.Stdin)
		packageName, _ := reader.ReadString('\n')
		packageName = strings.TrimSpace(packageName)

		if packageName == "" {
			return process.ServerOutputMsg("[warn] installation cancelled")
		}

		cmd := exec.Command(packageManager, "install", packageName)
		cmd.Dir = workDir
		output, err := cmd.CombinedOutput()

		if err != nil {
			return process.ServerOutputMsg(fmt.Sprintf("[error] failed to install %s: %s", packageName, strings.TrimSpace(string(output))))
		}

		return process.ServerOutputMsg(fmt.Sprintf("[ok] installed %s successfully", packageName))
	}
}

type FilterUpdateMsg string

func PromptFilter() tea.Cmd {
	return func() tea.Msg {
		fmt.Print("\n\nFilter text (leave empty to clear): ")
		reader := bufio.NewReader(os.Stdin)
		text, _ := reader.ReadString('\n')
		text = strings.TrimSpace(text)
		return FilterUpdateMsg(text)
	}
}
