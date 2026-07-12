# Homebrew cask served straight from this repo (no separate homebrew-tap repo):
#   brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw
#   brew install --cask skriuw
#
# `version` and `sha256` are rewritten by the manifests job in
# .github/workflows/publish-linux-repos.yml whenever a desktop release is
# published — do not bump them by hand.
cask "skriuw" do
  version "0.22.0"
  sha256 "cba28a6115c3a033eb5677ad727045d77d9902bd3fb0a15e32f6989b324e15a4"

  url "https://github.com/remcostoeten/skriuw/releases/download/desktop-v#{version}/Skriuw_#{version}_universal.dmg"
  name "Skriuw"
  desc "Quiet writing workspace for notes, journaling, sharing, and planning"
  homepage "https://github.com/remcostoeten/skriuw"

  livecheck do
    url :url
    regex(/^desktop[._-]v?(\d+(?:\.\d+)+)$/i)
  end

  app "Skriuw.app"

  # The .dmg is not signed/notarized, so Gatekeeper would refuse to open it;
  # dropping the quarantine attribute after install makes it launchable.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Skriuw.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/nl.remcostoeten.skriuw.dev",
    "~/Library/Caches/nl.remcostoeten.skriuw.dev",
    "~/Library/WebKit/nl.remcostoeten.skriuw.dev",
  ]
end
