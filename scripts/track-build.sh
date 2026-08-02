#!/usr/bin/env bash
set -euo pipefail

# Tracks bundle sizes, LoC, and file counts after each Tauri build.
# Appends a row to the canonical documentation build table.
# If total size change >= 0.1 MB from the previous build, also generates
# a diff report in apps/documentation/content/docs/builds/diffs/.
#
# Usage:  bash scripts/track-build.sh
#
# Add to package.json scripts:
#   "postbuild": "bash scripts/track-build.sh"
#
# Or run standalone after `bun run tauri build`.

THRESHOLD_MB=0.1
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/..")"
DOCS_DIR="$ROOT/apps/documentation/content/docs/builds"
TABLE_FILE="$DOCS_DIR/app-size-table.mdx"
DIFF_DIR="$DOCS_DIR/diffs"
BUNDLE_DIR="$ROOT/apps/desktop/src-tauri/target/release/bundle"
TAURI_CONF="$ROOT/apps/desktop/src-tauri/tauri.conf.json"

mkdir -p "$DIFF_DIR"

VERSION=$(grep '"version"' "$TAURI_CONF" | head -1 | sed 's/.*: *"\(.*\)",/\1/')
CUR_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TODAY=$(date +%Y-%m-%d)

get_size_mb() {
  local dir="$1" pattern="$2" file
  file=$(ls "$BUNDLE_DIR/$dir"/$pattern 2>/dev/null | head -1)
  if [ -n "$file" ] && [ -f "$file" ]; then
    local bytes
    bytes=$(stat --format="%s" "$file")
    awk "BEGIN { printf \"%.1f\", $bytes / 1048576 }"
  else
    echo ""
  fi
}

DEB_MB=$(get_size_mb deb "*.deb")
RPM_MB=$(get_size_mb rpm "*.rpm")
APPIMAGE_MB=$(get_size_mb appimage "*.AppImage")

if [ -z "$DEB_MB" ] && [ -z "$RPM_MB" ] && [ -z "$APPIMAGE_MB" ]; then
  echo "No bundles found at $BUNDLE_DIR — skipping tracking"
  exit 0
fi

RUST_DIR="$ROOT/apps/desktop/src-tauri/src"
if [ -d "$RUST_DIR" ]; then
  RUST_FILES=$(find "$RUST_DIR" -name '*.rs' | wc -l)
  RUST_LOC=$(find "$RUST_DIR" -name '*.rs' -exec cat {} + | wc -l)
else
  RUST_FILES=0; RUST_LOC=0
fi

SPA_DIR="$ROOT/packages/web-spa/src"
if [ -d "$SPA_DIR" ]; then
  TSJS_FILES=$(find "$SPA_DIR" \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) | wc -l)
  TSJS_LOC=$(find "$SPA_DIR" \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -exec cat {} + | wc -l)
else
  TSJS_FILES=0; TSJS_LOC=0
fi

get_prev_commit() {
  if [ -f "$TABLE_FILE" ]; then
    grep '^|' "$TABLE_FILE" | grep -v '^| *Date' | tail -1 | awk -F'|' '{print $4}' | xargs
  fi
}

TOTAL=$(awk "BEGIN { printf \"%.1f\", (${DEB_MB:-0} + ${RPM_MB:-0} + ${APPIMAGE_MB:-0}) }")

should_write=true
if [ -f "$TABLE_FILE" ]; then
  prev_row=$(grep '^|' "$TABLE_FILE" | grep -v '^| *Date' | tail -1 || true)
  if [ -n "$prev_row" ]; then
    # Columns (with leading | → $1 empty): | Date | Version | Commit | .deb | .rpm | .AppImage | ...
    prev_total=$(echo "$prev_row" | awk -F'|' '{
      for (i = 5; i <= 7; i++) {
        val = $i
        gsub(/[[:space:]]*MB[[:space:]]*/, "", val)
        gsub(/[[:space:]]/, "", val)
        if (val ~ /^[0-9]+\.?[0-9]*$/) total += val + 0
      }
      printf "%.1f", total
    }')
    diff=$(awk "BEGIN { d = $TOTAL - $prev_total; if (d < 0) d = -d; printf \"%.1f\", d }")
    if [ "$(awk "BEGIN { printf \"%d\", ($diff < $THRESHOLD_MB) }")" = 1 ]; then
      should_write=false
      echo "Size change ${diff}MB < ${THRESHOLD_MB}MB threshold — skipping"
    fi
  fi
fi

if [ "$should_write" = true ] || [ ! -f "$TABLE_FILE" ]; then
  prev_commit=$(get_prev_commit)

  if [ -n "$prev_commit" ] && [ "$prev_commit" != "$CUR_COMMIT" ] && [ "$prev_commit" != "unknown" ]; then
    DIFF_FILE="$DIFF_DIR/${TODAY}.md"
    {
      echo "# Build Diff: $(date)"
      echo ""
      echo "Comparing \`$prev_commit\` → \`$CUR_COMMIT\`"
      echo ""
      echo "## Bundle sizes"
      echo ""
      echo "| Bundle | Size |"
      echo "|--------|------|"
      [ -n "$DEB_MB" ] && echo "| .deb | ${DEB_MB} MB |"
      [ -n "$RPM_MB" ] && echo "| .rpm | ${RPM_MB} MB |"
      [ -n "$APPIMAGE_MB" ] && echo "| .AppImage | ${APPIMAGE_MB} MB |"
      echo ""
      echo "## Commits"
      echo ""
      echo '```'
      git log --oneline --no-merges "$prev_commit..$CUR_COMMIT" -- . 2>/dev/null || echo "(no new commits)"
      echo '```'
      echo ""
      echo "## Changed files"
      echo ""
      echo '```'
      git diff --stat "$prev_commit..$CUR_COMMIT" -- . 2>/dev/null || true
      echo '```'
      echo ""
      echo "## Dependency changes"
      echo ""
      if git diff --name-only "$prev_commit..$CUR_COMMIT" -- apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock 2>/dev/null | grep -q .; then
        echo "### Cargo"
        echo '```diff'
        git diff "$prev_commit..$CUR_COMMIT" -- apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock 2>/dev/null | head -100
        echo '```'
      fi
      if git diff --name-only "$prev_commit..$CUR_COMMIT" -- packages/web-spa/package.json apps/desktop/package.json 2>/dev/null | grep -q .; then
        echo "### npm"
        echo '```diff'
        git diff "$prev_commit..$CUR_COMMIT" -- packages/web-spa/package.json apps/desktop/package.json 2>/dev/null | head -100
        echo '```'
      fi
    } > "$DIFF_FILE"

    DIFF_LINK="[diff](./diffs/${TODAY}.md)"
  else
    DIFF_LINK="—"
  fi

  ROW="| ${TODAY} | ${VERSION} | ${CUR_COMMIT} | ${DEB_MB:-—} MB | ${RPM_MB:-—} MB | ${APPIMAGE_MB:-—} MB | ${RUST_FILES} | ${RUST_LOC} | ${TSJS_FILES} | ${TSJS_LOC} | ${DIFF_LINK} |"

  if [ ! -f "$TABLE_FILE" ]; then
    cat > "$TABLE_FILE" << 'HEADER'
# App Bundle Sizes

| Date | Version | Commit | .deb | .rpm | .AppImage | Rust files | Rust LoC | TS/JS files | TS/JS LoC | Diff report |
|------|---------|--------|------|------|-----------|-----------|---------|------------|----------|-------------|
HEADER
  fi

  echo "$ROW" >> "$TABLE_FILE"
  echo "Appended build data to $TABLE_FILE"
else
  echo "No update written"
fi
