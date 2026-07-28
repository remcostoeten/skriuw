# Homebrew cask served straight from this repo (no separate homebrew-tap repo):
#   brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw
#   brew install --cask skriuw
#
# `version` and the two `sha256` values are rewritten by the manifests job in
# .github/workflows/publish-linux-repos.yml whenever a v2 release is
# published — do not bump them by hand.
cask "skriuw" do
  arch arm: "aarch64", intel: "x64"

  version "0.5.0"
  sha256 arm: "79fcec8a9ce0125abd193f5672edfd42cc7463b1f46a5f95b948536f8fc29b9f", intel: "85ddad397a20dcbe02604fca0fd587d038999e69bbdf27c833ca78c9e09a7b02"

  url "https://github.com/remcostoeten/skriuw/releases/download/v2-v#{version}/Skriuw_#{version}_#{arch}.dmg"
  name "Skriuw"
  desc "Quiet writing workspace for notes, journaling, sharing, and planning"
  homepage "https://github.com/remcostoeten/skriuw"

  livecheck do
    url :url
    regex(/^v2[._-]v?(\d+(?:\.\d+)+)$/i)
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
