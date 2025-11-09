package main

import (
	"bufio"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

type serverOutputMsg string
type serverPortMsg string
type serverErrorMsg struct{ err error }

type ServerProcess struct {
	Command string
	Args    []string
	WorkDir string
	Port    string
	cmd     *exec.Cmd
	output  []string
	mu      sync.Mutex
}

func NewServerProcess(command string, args []string, workDir string) *ServerProcess {
	return &ServerProcess{
		Command: command,
		Args:    args,
		WorkDir: workDir,
		output:  make([]string, 0),
	}
}

func (sp *ServerProcess) Start() tea.Cmd {
	return func() tea.Msg {
		sp.cmd = exec.Command(sp.Command, sp.Args...)
		sp.cmd.Dir = sp.WorkDir

		stdout, err := sp.cmd.StdoutPipe()
		if err != nil {
			return serverErrorMsg{err}
		}

		stderr, err := sp.cmd.StderrPipe()
		if err != nil {
			return serverErrorMsg{err}
		}

		if err := sp.cmd.Start(); err != nil {
			return serverErrorMsg{err}
		}

		go func() {
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				line := scanner.Text()
				sp.AddOutput(line)

				if port := extractPort(line); port != "" {
					sp.mu.Lock()
					if sp.Port == "" {
						sp.Port = port
					}
					sp.mu.Unlock()
				}
			}
		}()

		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				sp.AddOutput(scanner.Text())
			}
		}()

		return serverOutputMsg("")
	}
}

func waitForServerOutput() tea.Cmd {
	return tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
		return serverOutputMsg("")
	})
}

func (sp *ServerProcess) Stop() {
	if sp.cmd != nil && sp.cmd.Process != nil {
		sp.cmd.Process.Kill()
		sp.cmd.Wait()
	}
}

func (sp *ServerProcess) AddOutput(line string) {
	sp.mu.Lock()
	defer sp.mu.Unlock()

	sp.output = append(sp.output, line)
	if len(sp.output) > 200 {
		sp.output = sp.output[len(sp.output)-200:]
	}
}

func (sp *ServerProcess) GetRecentOutput(n int) string {
	sp.mu.Lock()
	defer sp.mu.Unlock()

	if len(sp.output) == 0 {
		return "Starting server..."
	}

	start := len(sp.output) - n
	if start < 0 {
		start = 0
	}

	return strings.Join(sp.output[start:], "\n")
}

func extractPort(line string) string {
	patterns := []string{
		`localhost:(\d+)`,
		`http://[^:]+:(\d+)`,
		`port (\d+)`,
		`0\.0\.0\.0:(\d+)`,
		`127\.0\.0\.1:(\d+)`,
		`:(\d{4,5})\b`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(line); len(matches) > 1 {
			return matches[1]
		}
	}

	return ""
}
