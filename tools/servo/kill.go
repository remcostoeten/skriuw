package main

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

func killDevProcesses() (string, error) {
	var messages []string
	ports := []string{"42069", "6969", "1420"}

	for _, port := range ports {
		msg, err := killPort(port)
		if err != nil {
			return "", err
		}
		if msg != "" {
			messages = append(messages, msg)
		}
	}

	if msg, err := killByPattern("tauri dev", "Killed lingering Tauri dev processes"); err != nil {
		return "", err
	} else if msg != "" {
		messages = append(messages, msg)
	}

	if len(messages) == 0 {
		return "No dev processes were running", nil
	}

	return strings.Join(messages, "\n"), nil
}

func killPort(port string) (string, error) {
	cmd := exec.Command("lsof", "-ti:"+port)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				return "", nil
			}
			if len(exitErr.Stderr) == 0 {
				return "", nil
			}
		}

		var execErr *exec.Error
		if errors.As(err, &execErr) {
			return "", fmt.Errorf("lsof command not available: %w", err)
		}

		return "", fmt.Errorf("failed to inspect port %s: %w", port, err)
	}

	pids := strings.Fields(strings.TrimSpace(string(output)))
	if len(pids) == 0 {
		return "", nil
	}

	killArgs := append([]string{"-9"}, pids...)
	if err := exec.Command("kill", killArgs...).Run(); err != nil {
		return "", fmt.Errorf("failed to kill processes on port %s: %w", port, err)
	}

	return fmt.Sprintf("Killed process on port %s (%s)", port, strings.Join(pids, ", ")), nil
}

func killByPattern(pattern string, successMessage string) (string, error) {
	cmd := exec.Command("pkill", "-f", pattern)
	err := cmd.Run()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				return "", nil
			}
		}

		var execErr *exec.Error
		if errors.As(err, &execErr) {
			return "", fmt.Errorf("pkill command not available: %w", err)
		}

		return "", fmt.Errorf("failed to stop processes matching %q: %w", pattern, err)
	}

	return successMessage, nil
}
