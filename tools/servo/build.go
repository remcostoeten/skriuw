// tools/servo/build.go
package main

import (
	"bufio"
	"os/exec"
	"strings"
	"sync"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

type buildOutputMsg string
type buildCompleteMsg struct{}
type buildErrorMsg struct{ err error }
type returnToMenuMsg struct{}

type BuildProcess struct {
	Command  string
	Args     []string
	WorkDir  string
	TaskName string
	cmd      *exec.Cmd
	output   []string
	mu       sync.Mutex
	done     bool
	errored  bool
}

func NewBuildProcess(command string, args []string, workDir string, taskName string) *BuildProcess {
	return &BuildProcess{
		Command:  command,
		Args:     args,
		WorkDir:  workDir,
		TaskName: taskName,
		output:   make([]string, 0),
	}
}

func (bp *BuildProcess) Start() tea.Cmd {
	return func() tea.Msg {
		bp.cmd = exec.Command(bp.Command, bp.Args...)
		bp.cmd.Dir = bp.WorkDir

		stdout, err := bp.cmd.StdoutPipe()
		if err != nil {
			return buildErrorMsg{err}
		}

		stderr, err := bp.cmd.StderrPipe()
		if err != nil {
			return buildErrorMsg{err}
		}

		if err := bp.cmd.Start(); err != nil {
			return buildErrorMsg{err}
		}

		// Read stdout
		go func() {
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				bp.AddOutput(scanner.Text())
			}
		}()

		// Read stderr
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				bp.AddOutput(scanner.Text())
			}
		}()

		// Wait for completion in background
		go func() {
			err := bp.cmd.Wait()
			bp.mu.Lock()
			bp.done = true
			if err != nil {
				bp.errored = true
			}
			bp.mu.Unlock()
		}()

		return waitForBuildOutput()
	}
}

func waitForBuildOutput() tea.Cmd {
	return tea.Tick(time.Millisecond*100, func(t time.Time) tea.Msg {
		return buildOutputMsg("")
	})
}

func (bp *BuildProcess) Stop() {
	if bp.cmd != nil && bp.cmd.Process != nil {
		bp.cmd.Process.Kill()
	}
}

func (bp *BuildProcess) AddOutput(line string) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	bp.output = append(bp.output, line)
	if len(bp.output) > 100 {
		bp.output = bp.output[len(bp.output)-100:]
	}
}

func (bp *BuildProcess) GetRecentOutput(n int) string {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	if len(bp.output) == 0 {
		return "Starting build..."
	}

	start := len(bp.output) - n
	if start < 0 {
		start = 0
	}

	return strings.Join(bp.output[start:], "\n")
}

func (bp *BuildProcess) IsDone() bool {
	bp.mu.Lock()
	defer bp.mu.Unlock()
	return bp.done
}

func (bp *BuildProcess) HasError() bool {
	bp.mu.Lock()
	defer bp.mu.Unlock()
	return bp.errored
}
