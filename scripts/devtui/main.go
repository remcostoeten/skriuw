package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const (
	repoSlug   = "remcostoeten/skriuw"
	aurPackage = "skriuw-bin"
	snapName   = "skriuw"
)

type pageKind int

const (
	kindMenu pageKind = iota
	kindConfirm
	kindText
)

type item struct {
	title    string
	desc     string
	badge    string
	disabled bool
	child    func(m *model) (page, error)
	exec     func(m *model) tea.Cmd
}

type page struct {
	kind   pageKind
	title  string
	hint   string
	items  []item
	cursor int
	body   []string
	offset int
	prompt []string
	onYes  func(m *model) tea.Cmd
}

type model struct {
	root       string
	stack      []page
	status     string
	statusErr  bool
	busy       string
	width      int
	height     int
	launchKind string
	quitting   bool
}

type doneMsg struct {
	label string
	err   error
}

type statusMsg struct {
	text string
	err  bool
}

type releaseMsg struct {
	rel *release
	err error
}

var (
	accent = lipgloss.Color("39")
	muted  = lipgloss.Color("249")
	dim    = lipgloss.Color("240")
	danger = lipgloss.Color("203")
	good   = lipgloss.Color("42")
	warn   = lipgloss.Color("214")

	titleStyle  = lipgloss.NewStyle().Bold(true).Foreground(accent)
	crumbStyle  = lipgloss.NewStyle().Foreground(dim)
	cursorStyle = lipgloss.NewStyle().Bold(true).Foreground(accent)
	selectStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("15"))
	normalStyle = lipgloss.NewStyle().Foreground(muted)
	offStyle    = lipgloss.NewStyle().Foreground(dim).Strikethrough(true)
	descStyle   = lipgloss.NewStyle().Foreground(dim)
	badgeStyle  = lipgloss.NewStyle().Foreground(warn)
	helpStyle   = lipgloss.NewStyle().Foreground(dim)
	okStyle     = lipgloss.NewStyle().Foreground(good)
	errStyle    = lipgloss.NewStyle().Foreground(danger)
	warnStyle   = lipgloss.NewStyle().Bold(true).Foreground(warn)
	bodyStyle   = lipgloss.NewStyle().Foreground(muted)
)

func main() {
	root, err := findRepoRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, "skriuw dev: "+err.Error())
		os.Exit(1)
	}

	m := model{root: root, stack: []page{rootPage()}}
	if _, err := tea.NewProgram(&m).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func rootPage() page {
	return page{
		title: "Skriuw",
		hint:  "dev launcher",
		items: []item{
			{
				title: "Run web",
				desc:  "next dev --turbopack · localhost:3000",
				exec:  bun("apps/web", "dev"),
			},
			{
				title: "Run mobile",
				desc:  "expo dev server · android emulator",
				badge: "▸",
				child: mobilePage,
			},
			{
				title: "Run desktop development",
				desc:  "tauri dev — boots the web-spa vite server itself",
				exec:  bun("apps/desktop", "dev"),
			},
			{
				title: "Run local desktop build",
				desc:  "tauri build, and inspect what is already in target/",
				badge: "▸",
				child: desktopBuildPage,
			},
			{
				title: "Build",
				desc:  "production bundles — web and desktop",
				badge: "▸",
				child: buildPage,
			},
			{
				title: "Releases",
				desc:  "latest release, changelog, reinstall from a channel",
				badge: "▸",
				child: releasesPage,
			},
		},
	}
}

func mobilePage(m *model) (page, error) {
	return page{
		title: "Mobile",
		hint:  "expo · apps/mobile",
		items: []item{
			{
				title: "Expo dev server",
				desc:  "expo start --dev-client",
				exec:  bun("apps/mobile", "start"),
			},
			{
				title: "Android emulator",
				desc:  "pick an AVD and boot it in the background",
				badge: "▸",
				child: avdPage,
			},
			{
				title: "Run on Android",
				desc:  "expo run:android — builds and installs on the running device",
				exec:  bun("apps/mobile", "android"),
			},
		},
	}, nil
}

func avdPage(m *model) (page, error) {
	bin, err := emulatorBin()
	if err != nil {
		return page{}, err
	}
	avds, err := listAVDs(bin)
	if err != nil {
		return page{}, err
	}
	if len(avds) == 0 {
		return page{}, fmt.Errorf("no AVDs — create one in Android Studio › Device Manager")
	}

	items := make([]item, 0, len(avds)+1)
	for _, avd := range avds {
		name := avd
		items = append(items, item{
			title: name,
			desc:  "boot in the background, then pick “Run on Android”",
			exec: func(m *model) tea.Cmd {
				return bootEmulator(bin, name)
			},
		})
	}
	items = append(items, item{
		title: "Run on Android",
		desc:  "expo run:android against whichever emulator is up",
		exec:  bun("apps/mobile", "android"),
	})

	return page{title: "Android emulator", hint: "avd", items: items}, nil
}

func desktopBuildPage(m *model) (page, error) {
	return page{
		title: "Local desktop build",
		hint:  "apps/desktop · tauri",
		items: []item{
			{
				title: "Build now",
				desc:  "NO_STRIP=1 tauri build — every bundle in tauri.conf.json",
				exec:  tauriBuild("", ""),
			},
			{
				title: "Check latest build in target/*",
				desc:  "bundled artifacts, newest first — enter launches an AppImage",
				badge: "▸",
				child: artifactPage,
			},
		},
	}, nil
}

func buildPage(m *model) (page, error) {
	return page{
		title: "Build",
		hint:  "production",
		items: []item{
			{
				title: "Web",
				desc:  "next build — the prebuild hook runs the unit suite first",
				exec:  bun("apps/web", "build"),
			},
			{
				title: "Web + docs",
				desc:  "root build: apps/web then apps/documentation",
				exec:  bunRoot("build"),
			},
			{
				title: "Desktop",
				desc:  "tauri build — all bundles, or one target",
				badge: "▸",
				child: desktopBundlePage,
			},
		},
	}, nil
}

func desktopBundlePage(m *model) (page, error) {
	return page{
		title: "Desktop bundles",
		hint:  "tauri build --bundles",
		items: []item{
			{
				title: "All",
				desc:  "every bundle configured in tauri.conf.json",
				exec:  tauriBuild("", ""),
			},
			{
				title: "AppImage",
				desc:  "--bundles appimage — offers to launch it when the build lands",
				exec:  tauriBuild("appimage", "AppImage"),
			},
			{
				title: "deb",
				desc:  "--bundles deb",
				exec:  tauriBuild("deb", ""),
			},
			{
				title: "rpm",
				desc:  "--bundles rpm",
				exec:  tauriBuild("rpm", ""),
			},
		},
	}, nil
}

func artifactPage(m *model) (page, error) {
	arts, err := scanArtifacts(m.root)
	if err != nil {
		return page{}, err
	}
	if len(arts) == 0 {
		return page{}, fmt.Errorf("nothing bundled in apps/desktop/src-tauri/target — run a desktop build first")
	}

	items := make([]item, 0, len(arts))
	for i, a := range arts {
		art := a
		badge := ""
		if i == 0 {
			badge = "latest"
		}
		items = append(items, item{
			title: fmt.Sprintf("%-9s %s", art.kind, art.version),
			desc:  fmt.Sprintf("%s · %s · built %s", art.name, humanSize(art.size), humanAge(art.mtime)),
			badge: badge,
			exec: func(m *model) tea.Cmd {
				return openArtifact(art)
			},
		})
	}

	return page{
		title: "Bundled builds",
		hint:  "src-tauri/target · newest first",
		items: items,
	}, nil
}

func releasesPage(m *model) (page, error) {
	return page{
		title: "Releases",
		hint:  "github.com/" + repoSlug,
		items: []item{
			{
				title: "View latest release",
				desc:  "version, published date, changelog, assets",
				exec: func(m *model) tea.Cmd {
					m.busy = "fetching latest release…"
					return fetchRelease
				},
			},
			{
				title: "Open on GitHub",
				desc:  "releases/latest in your browser",
				exec: func(m *model) tea.Cmd {
					return openURL("https://github.com/" + repoSlug + "/releases/latest")
				},
			},
			{
				title: "Install from latest release",
				desc:  "purge every installed Skriuw, then reinstall from one channel",
				badge: "▸",
				child: installPage,
			},
			{
				title: "Uninstall everywhere",
				desc:  "remove every installed Skriuw — notes and config are kept",
				exec: func(m *model) tea.Cmd {
					m.push(purgeConfirmPage(channel{}, false))
					return nil
				},
			},
		},
	}, nil
}

type channel struct {
	id      string
	title   string
	desc    string
	tool    string
	install func(m *model, rel *release) (string, error)
}

func channels() []channel {
	return []channel{
		{
			id:    "aur",
			title: "AUR (yay)",
			desc:  "yay -S " + aurPackage,
			tool:  "yay",
			install: func(m *model, rel *release) (string, error) {
				return "yay -S --noconfirm " + aurPackage, nil
			},
		},
		{
			id:    "snap",
			title: "Snap",
			desc:  "sudo snap install " + snapName,
			tool:  "snap",
			install: func(m *model, rel *release) (string, error) {
				return "sudo snap install " + snapName, nil
			},
		},
		{
			id:    "apt",
			title: "apt / dpkg",
			desc:  "download the .deb asset and install it",
			tool:  "apt-get",
			install: func(m *model, rel *release) (string, error) {
				asset, err := rel.pick(".deb")
				if err != nil {
					return "", err
				}
				return downloadCmd(asset) + "\n" +
					"sudo apt-get install -y \"$ASSET\" || sudo dpkg -i \"$ASSET\"", nil
			},
		},
		{
			id:    "rpm",
			title: "dnf / rpm",
			desc:  "download the .rpm asset and install it",
			tool:  "rpm",
			install: func(m *model, rel *release) (string, error) {
				asset, err := rel.pick(".rpm")
				if err != nil {
					return "", err
				}
				return downloadCmd(asset) + "\n" +
					"sudo dnf install -y \"$ASSET\" || sudo rpm -i \"$ASSET\"", nil
			},
		},
		{
			id:    "appimage",
			title: "AppImage",
			desc:  "download to ~/Applications, symlink into ~/.local/bin, add a desktop entry",
			tool:  "",
			install: func(m *model, rel *release) (string, error) {
				asset, err := rel.pick(".appimage")
				if err != nil {
					return "", err
				}
				return downloadCmd(asset) + installAppImageScript, nil
			},
		},
	}
}

func installPage(m *model) (page, error) {
	items := []item{}
	for _, c := range channels() {
		ch := c
		missing := ch.tool != "" && !hasBinary(ch.tool)
		badge := ""
		desc := ch.desc
		if missing {
			badge = "unavailable"
			desc = ch.desc + " — " + ch.tool + " is not on this system"
		}
		items = append(items, item{
			title:    ch.title,
			desc:     desc,
			badge:    badge,
			disabled: missing,
			exec: func(m *model) tea.Cmd {
				m.push(purgeConfirmPage(ch, true))
				return nil
			},
		})
	}

	return page{
		title: "Install from latest release",
		hint:  "purge, then reinstall",
		items: items,
	}, nil
}

func purgeConfirmPage(ch channel, reinstall bool) page {
	prompt := []string{
		warnStyle.Render("This removes every installed copy of Skriuw:"),
		"",
		"  · pacman / AUR package (" + aurPackage + ", skriuw)",
		"  · snap (" + snapName + ")",
		"  · dpkg / apt package (skriuw)",
		"  · rpm / dnf package (skriuw)",
		"  · flatpak app",
		"  · AppImages in ~/Applications and ~/.local/bin, plus their .desktop entries",
		"",
		okStyle.Render("Your notes and settings are NOT touched") + descStyle.Render(" — the vault, ~/.config/skriuw"),
		descStyle.Render("  and ~/.local/share/skriuw are all left alone. Only the app binaries go."),
		"",
		descStyle.Render("Package removals need sudo, so you may be prompted for your password."),
	}

	title := "Uninstall everywhere"
	if reinstall {
		title = "Reinstall via " + ch.title
		prompt = append(prompt,
			"",
			"Then it installs the latest release with "+selectStyle.Render(ch.title)+".",
		)
	}

	return page{
		kind:   kindConfirm,
		title:  title,
		hint:   "destructive",
		prompt: prompt,
		onYes: func(m *model) tea.Cmd {
			script := purgeScript
			label := "uninstall"

			if reinstall {
				rel, err := latestRelease()
				if err != nil {
					return status("could not read the latest release: "+err.Error(), true)
				}
				install, err := ch.install(m, rel)
				if err != nil {
					return status(err.Error(), true)
				}
				script += "\n\necho\necho '=> installing " + ch.title + " (" + rel.Tag + ")'\n" + install
				label = "reinstall via " + ch.title
				if ch.id == "appimage" {
					m.launchKind = "AppImage"
				}
			}

			return runShell(m, label, script)
		},
	}
}

func (m *model) Init() tea.Cmd { return nil }

func (m *model) current() *page { return &m.stack[len(m.stack)-1] }

func (m *model) push(p page) {
	m.stack = append(m.stack, p)
	m.status = ""
}

func (m *model) pop() {
	if len(m.stack) > 1 {
		m.stack = m.stack[:len(m.stack)-1]
		m.status = ""
	}
}

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height

	case statusMsg:
		m.busy = ""
		m.status, m.statusErr = msg.text, msg.err

	case releaseMsg:
		m.busy = ""
		if msg.err != nil {
			m.status, m.statusErr = msg.err.Error(), true
			return m, nil
		}
		m.push(releaseTextPage(msg.rel))

	case doneMsg:
		m.busy = ""
		if msg.err != nil {
			m.launchKind = ""
			m.status, m.statusErr = fmt.Sprintf("%s exited: %v", msg.label, msg.err), true
			return m, nil
		}
		m.status, m.statusErr = msg.label+" finished", false
		if kind := m.launchKind; kind != "" {
			m.launchKind = ""
			if art, err := newestArtifact(m.root, kind); err == nil {
				m.push(launchConfirmPage(art))
			}
		}

	case tea.KeyMsg:
		return m.onKey(msg)
	}

	return m, nil
}

func (m *model) onKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	p := m.current()
	key := msg.String()

	switch key {
	case "ctrl+c", "q":
		m.quitting = true
		return m, tea.Quit
	case "esc", "backspace", "left", "h":
		m.pop()
		return m, nil
	}

	switch p.kind {
	case kindConfirm:
		switch key {
		case "y", "Y", "enter":
			onYes := p.onYes
			m.pop()
			if onYes != nil {
				return m, onYes(m)
			}
		case "n", "N":
			m.pop()
		}
		return m, nil

	case kindText:
		switch key {
		case "down", "j":
			p.offset++
		case "up", "k":
			if p.offset > 0 {
				p.offset--
			}
		case "g":
			p.offset = 0
		case "o":
			return m, openURL(p.hint)
		}
		if max := len(p.body) - m.textHeight(); p.offset > max {
			p.offset = maxInt(0, max)
		}
		return m, nil
	}

	switch key {
	case "up", "k":
		p.cursor = (p.cursor - 1 + len(p.items)) % len(p.items)
	case "down", "j":
		p.cursor = (p.cursor + 1) % len(p.items)
	case "enter", "right", "l", " ":
		if len(p.items) == 0 {
			return m, nil
		}
		it := p.items[p.cursor]
		if it.disabled {
			m.status, m.statusErr = "not available on this system", true
			return m, nil
		}
		if it.child != nil {
			next, err := it.child(m)
			if err != nil {
				m.status, m.statusErr = err.Error(), true
				return m, nil
			}
			m.push(next)
			return m, nil
		}
		if it.exec != nil {
			m.status = ""
			return m, it.exec(m)
		}
	case "r":
		m.reload()
	}

	return m, nil
}

func (m *model) reload() {
	if len(m.stack) < 2 {
		return
	}
	parent := m.stack[len(m.stack)-2]
	it := parent.items[parent.cursor]
	if it.child == nil {
		return
	}
	next, err := it.child(m)
	if err != nil {
		m.status, m.statusErr = err.Error(), true
		return
	}
	next.cursor = minInt(m.current().cursor, maxInt(0, len(next.items)-1))
	m.stack[len(m.stack)-1] = next
	m.status, m.statusErr = "refreshed", false
}

func (m *model) textHeight() int {
	h := m.height - 8
	if h < 5 {
		return 5
	}
	return h
}

func (m *model) View() string {
	if m.quitting {
		return ""
	}

	p := m.current()
	var b strings.Builder

	b.WriteString("\n  " + titleStyle.Render(p.title))
	if p.hint != "" && p.kind != kindText {
		b.WriteString("  " + crumbStyle.Render(p.hint))
	}
	if len(m.stack) > 1 {
		trail := make([]string, 0, len(m.stack))
		for _, s := range m.stack {
			trail = append(trail, s.title)
		}
		b.WriteString("\n  " + crumbStyle.Render(strings.Join(trail, " › ")))
	}
	b.WriteString("\n\n")

	help := "↑/↓ move · enter select · esc back · r refresh · q quit"

	switch p.kind {
	case kindConfirm:
		for _, line := range p.prompt {
			b.WriteString("  " + line + "\n")
		}
		b.WriteString("\n  " + warnStyle.Render("[y]") + " do it   " + normalStyle.Render("[n] cancel") + "\n")
		help = "y confirm · n / esc cancel"

	case kindText:
		lines := p.body
		end := minInt(len(lines), p.offset+m.textHeight())
		for _, line := range lines[minInt(p.offset, len(lines)):end] {
			b.WriteString("  " + line + "\n")
		}
		if end < len(lines) {
			b.WriteString("\n  " + descStyle.Render(fmt.Sprintf("… %d more lines", len(lines)-end)) + "\n")
		}
		help = "↑/↓ scroll · o open on github · esc back · q quit"

	default:
		for i, it := range p.items {
			selected := i == p.cursor
			cursor := "   "
			title := normalStyle.Render(it.title)
			if it.disabled {
				title = offStyle.Render(it.title)
			}
			if selected {
				cursor = " " + cursorStyle.Render("›") + " "
				if !it.disabled {
					title = selectStyle.Render(it.title)
				}
			}
			line := cursor + title
			if it.badge != "" {
				line += " " + badgeStyle.Render(it.badge)
			}
			b.WriteString(line + "\n")
			if selected && it.desc != "" {
				b.WriteString("     " + descStyle.Render(it.desc) + "\n")
			}
		}
	}

	if m.busy != "" {
		b.WriteString("\n  " + descStyle.Render(m.busy) + "\n")
	} else if m.status != "" {
		style := okStyle
		if m.statusErr {
			style = errStyle
		}
		b.WriteString("\n  " + style.Render(m.status) + "\n")
	}

	b.WriteString("\n  " + helpStyle.Render(help) + "\n")
	return b.String()
}

func bun(dir string, script string) func(*model) tea.Cmd {
	return func(m *model) tea.Cmd {
		return runProcess(m, dir+" "+script, nil, "bun", "run", "--cwd", dir, script)
	}
}

func bunRoot(script string) func(*model) tea.Cmd {
	return func(m *model) tea.Cmd {
		return runProcess(m, "bun run "+script, nil, "bun", "run", script)
	}
}

func tauriBuild(bundle string, launchKind string) func(*model) tea.Cmd {
	return func(m *model) tea.Cmd {
		args := []string{"run", "--cwd", "apps/desktop", "tauri", "build"}
		label := "desktop build"
		if bundle != "" {
			args = append(args, "--bundles", bundle)
			label = "desktop build (" + bundle + ")"
		}
		m.launchKind = launchKind
		return runProcess(m, label, []string{"NO_STRIP=1"}, "bun", args...)
	}
}

func runProcess(m *model, label string, env []string, name string, args ...string) tea.Cmd {
	bin, err := exec.LookPath(name)
	if err != nil {
		return status(name+" is not on your PATH", true)
	}

	c := exec.Command(bin, args...)
	c.Dir = m.root
	c.Env = append(os.Environ(), env...)

	return tea.ExecProcess(c, func(err error) tea.Msg {
		return doneMsg{label: label, err: err}
	})
}

func runShell(m *model, label string, script string) tea.Cmd {
	c := exec.Command("bash", "-c", script)
	c.Dir = m.root
	c.Env = os.Environ()

	return tea.ExecProcess(c, func(err error) tea.Msg {
		return doneMsg{label: label, err: err}
	})
}

func status(text string, isErr bool) tea.Cmd {
	return func() tea.Msg {
		return statusMsg{text: text, err: isErr}
	}
}

type artifact struct {
	path    string
	name    string
	kind    string
	version string
	size    int64
	mtime   time.Time
}

// rpm names carry a release+arch tail (Skriuw-0.21.0-1.x86_64), so the
// prerelease suffix is matched explicitly rather than as a greedy tail.
var versionRe = regexp.MustCompile(`[_-]v?(\d+\.\d+\.\d+(?:-(?:alpha|beta|rc|pre)[0-9A-Za-z.]*)?)`)

func scanArtifacts(root string) ([]artifact, error) {
	target := filepath.Join(root, "apps", "desktop", "src-tauri", "target")
	patterns := []string{
		filepath.Join(target, "*", "bundle", "*", "*"),
		filepath.Join(target, "*", "*", "bundle", "*", "*"),
	}
	kinds := map[string]string{
		".appimage": "AppImage",
		".deb":      "deb",
		".rpm":      "rpm",
	}

	seen := map[string]bool{}
	arts := []artifact{}
	for _, pattern := range patterns {
		paths, err := filepath.Glob(pattern)
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			kind, isBundle := kinds[strings.ToLower(filepath.Ext(path))]
			if !isBundle || seen[path] {
				continue
			}
			info, err := os.Stat(path)
			if err != nil || info.IsDir() {
				continue
			}
			seen[path] = true

			name := filepath.Base(path)
			version := "unknown"
			if match := versionRe.FindStringSubmatch(name); match != nil {
				version = match[1]
			}
			arts = append(arts, artifact{
				path:    path,
				name:    name,
				kind:    kind,
				version: version,
				size:    info.Size(),
				mtime:   info.ModTime(),
			})
		}
	}

	sort.Slice(arts, func(i, j int) bool {
		return arts[i].mtime.After(arts[j].mtime)
	})
	return arts, nil
}

func newestArtifact(root string, kind string) (artifact, error) {
	arts, err := scanArtifacts(root)
	if err != nil {
		return artifact{}, err
	}
	for _, a := range arts {
		if a.kind == kind {
			return a, nil
		}
	}
	return artifact{}, fmt.Errorf("no %s in target/", kind)
}

func launchConfirmPage(a artifact) page {
	return page{
		kind:  kindConfirm,
		title: "Build finished",
		hint:  a.version,
		prompt: []string{
			okStyle.Render("Bundled ") + selectStyle.Render(a.name),
			descStyle.Render("  " + humanSize(a.size) + " · " + a.path),
			"",
			"Launch it now?",
		},
		onYes: func(m *model) tea.Cmd {
			return openArtifact(a)
		},
	}
}

func openArtifact(a artifact) tea.Cmd {
	if a.kind != "AppImage" {
		return status(a.path+" — install with your package manager", false)
	}

	return func() tea.Msg {
		if err := os.Chmod(a.path, 0o755); err != nil {
			return statusMsg{text: "chmod failed: " + err.Error(), err: true}
		}
		c := exec.Command(a.path)
		c.Dir = filepath.Dir(a.path)
		c.Env = os.Environ()
		c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := c.Start(); err != nil {
			return statusMsg{text: "launch failed: " + err.Error(), err: true}
		}
		go func() { _ = c.Wait() }()
		return statusMsg{text: fmt.Sprintf("launched %s (pid %d)", a.name, c.Process.Pid)}
	}
}

type asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
	Size int64  `json:"size"`
}

type release struct {
	Tag       string    `json:"tag_name"`
	Name      string    `json:"name"`
	Body      string    `json:"body"`
	URL       string    `json:"html_url"`
	Published time.Time `json:"published_at"`
	Assets    []asset   `json:"assets"`
}

func (r *release) pick(ext string) (asset, error) {
	for _, a := range r.Assets {
		if strings.HasSuffix(strings.ToLower(a.Name), ext) {
			return a, nil
		}
	}
	return asset{}, fmt.Errorf("release %s has no %s asset", r.Tag, ext)
}

func latestRelease() (*release, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/repos/"+repoSlug+"/releases/latest", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if token := githubToken(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned %s", res.Status)
	}

	rel := &release{}
	if err := json.NewDecoder(res.Body).Decode(rel); err != nil {
		return nil, err
	}
	return rel, nil
}

func githubToken() string {
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		return token
	}
	out, err := exec.Command("gh", "auth", "token").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func fetchRelease() tea.Msg {
	rel, err := latestRelease()
	return releaseMsg{rel: rel, err: err}
}

func releaseTextPage(r *release) page {
	name := r.Name
	if name == "" {
		name = r.Tag
	}

	body := []string{
		selectStyle.Render(name) + "  " + badgeStyle.Render(r.Tag),
		descStyle.Render("published " + humanAge(r.Published) + " · " + r.Published.Format("2006-01-02")),
		"",
	}
	for _, line := range strings.Split(strings.ReplaceAll(r.Body, "\r\n", "\n"), "\n") {
		body = append(body, renderMarkdownLine(line))
	}
	if len(r.Assets) > 0 {
		body = append(body, "", titleStyle.Render("Assets"))
		for _, a := range r.Assets {
			body = append(body, "  "+bodyStyle.Render(a.Name)+" "+descStyle.Render(humanSize(a.Size)))
		}
	}

	return page{
		kind:  kindText,
		title: "Latest release",
		hint:  r.URL,
		body:  body,
	}
}

func renderMarkdownLine(line string) string {
	trimmed := strings.TrimSpace(line)
	switch {
	case strings.HasPrefix(trimmed, "#"):
		return titleStyle.Render(strings.TrimSpace(strings.TrimLeft(trimmed, "#")))
	case strings.HasPrefix(trimmed, "- "), strings.HasPrefix(trimmed, "* "):
		return descStyle.Render("  •") + bodyStyle.Render(" "+strings.TrimSpace(trimmed[1:]))
	default:
		return bodyStyle.Render(line)
	}
}

func openURL(url string) tea.Cmd {
	return func() tea.Msg {
		bin, err := exec.LookPath("xdg-open")
		if err != nil {
			return statusMsg{text: url, err: false}
		}
		c := exec.Command(bin, url)
		c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := c.Start(); err != nil {
			return statusMsg{text: "could not open a browser: " + err.Error(), err: true}
		}
		go func() { _ = c.Wait() }()
		return statusMsg{text: "opened " + url}
	}
}

func downloadCmd(a asset) string {
	return fmt.Sprintf(`set -e
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ASSET="$TMP/%s"
echo "=> downloading %s (%s)"
curl -fL --progress-bar -o "$ASSET" %q
`, a.Name, a.Name, humanSize(a.Size), a.URL)
}

const installAppImageScript = `
mkdir -p "$HOME/Applications" "$HOME/.local/bin" "$HOME/.local/share/applications"
TARGET="$HOME/Applications/$(basename "$ASSET")"
install -m 755 "$ASSET" "$TARGET"
ln -sf "$TARGET" "$HOME/.local/bin/skriuw"
cat > "$HOME/.local/share/applications/skriuw.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Skriuw
Exec=$TARGET
Icon=skriuw
Categories=Office;Utility;
Terminal=false
StartupWMClass=Skriuw
DESKTOP
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
echo "=> installed $TARGET (symlinked as ~/.local/bin/skriuw)"
`

const purgeScript = `set -u
echo "=> removing installed Skriuw packages (notes and config are kept)"

if command -v pacman >/dev/null 2>&1; then
  for pkg in skriuw-bin skriuw; do
    if pacman -Qq "$pkg" >/dev/null 2>&1; then
      echo "   pacman: $pkg"
      sudo pacman -Rns --noconfirm "$pkg" || true
    fi
  done
fi

if command -v snap >/dev/null 2>&1 && snap list skriuw >/dev/null 2>&1; then
  echo "   snap: skriuw"
  sudo snap remove skriuw || true
fi

if command -v dpkg >/dev/null 2>&1 && dpkg -s skriuw >/dev/null 2>&1; then
  echo "   dpkg: skriuw"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get remove -y skriuw || true
  else
    sudo dpkg -r skriuw || true
  fi
fi

if command -v rpm >/dev/null 2>&1 && rpm -q skriuw >/dev/null 2>&1; then
  echo "   rpm: skriuw"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf remove -y skriuw || true
  else
    sudo rpm -e skriuw || true
  fi
fi

if command -v flatpak >/dev/null 2>&1; then
  flatpak list --app --columns=application 2>/dev/null | grep -i skriuw | while read -r app; do
    echo "   flatpak: $app"
    flatpak uninstall -y "$app" || true
  done
fi

for f in "$HOME"/Applications/[Ss]kriuw*.AppImage "$HOME"/.local/bin/skriuw "$HOME"/.local/share/applications/skriuw*.desktop; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  echo "   file: $f"
  rm -f "$f"
done

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "=> done — your vault, ~/.config/skriuw and ~/.local/share/skriuw were left alone"
`

func hasBinary(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func emulatorBin() (string, error) {
	if bin, err := exec.LookPath("emulator"); err == nil {
		return bin, nil
	}
	candidates := []string{}
	for _, env := range []string{"ANDROID_HOME", "ANDROID_SDK_ROOT"} {
		if sdk := os.Getenv(env); sdk != "" {
			candidates = append(candidates, filepath.Join(sdk, "emulator", "emulator"))
		}
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, "Android", "Sdk", "emulator", "emulator"))
	}
	for _, bin := range candidates {
		if _, err := os.Stat(bin); err == nil {
			return bin, nil
		}
	}
	return "", fmt.Errorf("android emulator not found — set ANDROID_HOME or put it on PATH")
}

func listAVDs(bin string) ([]string, error) {
	out, err := exec.Command(bin, "-list-avds").Output()
	if err != nil {
		return nil, fmt.Errorf("emulator -list-avds failed: %w", err)
	}
	avds := []string{}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "INFO") {
			avds = append(avds, line)
		}
	}
	return avds, nil
}

func bootEmulator(bin string, avd string) tea.Cmd {
	return func() tea.Msg {
		c := exec.Command(bin, "-avd", avd)
		c.Env = os.Environ()
		c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := c.Start(); err != nil {
			return statusMsg{text: "emulator failed to start: " + err.Error(), err: true}
		}
		go func() { _ = c.Wait() }()
		return statusMsg{text: fmt.Sprintf("booting %s (pid %d) — then pick “Run on Android”", avd, c.Process.Pid)}
	}
}

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if env := os.Getenv("SKRIUW_ROOT"); env != "" {
		dir = env
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "apps", "desktop", "src-tauri")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("run this from inside the skriuw repo")
		}
		dir = parent
	}
}

func humanSize(n int64) string {
	const unit = 1024
	if n < unit {
		return strconv.FormatInt(n, 10) + " B"
	}
	div, exp := int64(unit), 0
	for size := n / unit; size >= unit; size /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGT"[exp])
}

func humanAge(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
