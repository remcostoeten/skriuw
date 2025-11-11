package kill

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// CheckPort checks if a port is in use
func CheckPort(port string) (bool, string, error) {
	cmd := exec.Command("lsof", "-ti:"+port)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				// Port is not in use
				return false, "", nil
			}
		}

		var execErr *exec.Error
		if errors.As(err, &execErr) {
			return false, "", fmt.Errorf("lsof command not available: %w", err)
		}

		return false, "", fmt.Errorf("failed to check port %s: %w", port, err)
	}

	pids := strings.Fields(strings.TrimSpace(string(output)))
	if len(pids) == 0 {
		return false, "", nil
	}

	// Try to get process name
	processName := "unknown"
	if len(pids) > 0 {
		psCmd := exec.Command("ps", "-p", pids[0], "-o", "comm=")
		if psOutput, err := psCmd.Output(); err == nil {
			processName = strings.TrimSpace(string(psOutput))
		}
	}

	return true, fmt.Sprintf("Port %s is in use by %s (PID: %s)", port, processName, strings.Join(pids, ", ")), nil
}

func KillDevProcesses() (string, error) {
	var messages []string
	ports := []string{"42069", "6969", "1420"}

	for _, port := range ports {
		msg, err := KillPort(port)
		if err != nil {
			return "", err
		}
		if msg != "" {
			messages = append(messages, msg)
		}
	}

	if msg, err := KillByPattern("tauri dev", "Killed lingering Tauri dev processes"); err != nil {
		return "", err
	} else if msg != "" {
		messages = append(messages, msg)
	}

	if len(messages) == 0 {
		return "No dev processes were running", nil
	}

	return strings.Join(messages, "\n"), nil
}

func KillPort(port string) (string, error) {
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

func KillByPattern(pattern string, successMessage string) (string, error) {
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
