#!/usr/bin/env bash
set -euo pipefail

RESTORE_ROOT="${SKRIUW_RESTORE_DIR:-$HOME/.skriuw/restore}"
DRY_RUN=0
MODE="delete"
RESTORE_SESSION=""
MANIFEST_FILE=""
declare -a TARGETS=()

usage() {
	cat <<'EOF'
Usage:
  scripts/safe-delete.sh [--dry-run] [--manifest FILE] <path> [<path> ...]
  scripts/safe-delete.sh --restore <session-id|latest>
  scripts/safe-delete.sh --list-sessions

Options:
  --dry-run            Show actions without changing files.
  --manifest FILE      Read newline-separated paths from FILE.
  --restore SESSION    Restore files from a previous session.
  --list-sessions      Show available restore sessions.
  --help               Show this help.

Notes:
  - Deleted files are backed up into: ~/.skriuw/restore/<session-id>/files/
  - Per-file deletion log is written to: ~/.skriuw/restore/<session-id>/deletions.tsv
EOF
}

is_git_repo() {
	git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

is_tracked_file() {
	local path="$1"
	git ls-files --error-unmatch -- "$path" >/dev/null 2>&1
}

print_sessions() {
	mkdir -p "$RESTORE_ROOT"
	if ! ls -1 "$RESTORE_ROOT" >/dev/null 2>&1; then
		echo "No restore sessions found at $RESTORE_ROOT"
		return 0
	fi

	echo "Restore sessions in $RESTORE_ROOT:"
	ls -1t "$RESTORE_ROOT"
}

resolve_latest_session() {
	local latest
	latest="$(ls -1dt "$RESTORE_ROOT"/* 2>/dev/null | head -n1 || true)"
	if [[ -z "$latest" ]]; then
		echo ""
		return 0
	fi
	basename "$latest"
}

read_manifest_into_targets() {
	local file="$1"
	if [[ ! -f "$file" ]]; then
		echo "Manifest file not found: $file" >&2
		exit 1
	fi
	while IFS= read -r line || [[ -n "$line" ]]; do
		[[ -z "$line" ]] && continue
		TARGETS+=("$line")
	done <"$file"
}

delete_targets() {
	if [[ "${#TARGETS[@]}" -eq 0 ]]; then
		echo "No delete targets provided." >&2
		usage
		exit 1
	fi

	mkdir -p "$RESTORE_ROOT"
	local session_id
	session_id="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
	local session_dir="$RESTORE_ROOT/$session_id"
	local files_root="$session_dir/files"
	local log_file="$session_dir/deletions.tsv"
	local manifest="$session_dir/session.txt"

	if [[ "$DRY_RUN" -eq 1 ]]; then
		echo "[dry-run] Planned restore session: $session_id"
	else
		mkdir -p "$files_root"
		{
			echo "session_id=$session_id"
			echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
			echo "cwd=$(pwd)"
		} >"$manifest"
		printf "deleted_at_utc\toriginal_path\tbackup_path\n" >"$log_file"
	fi

	local deleted_count=0
	local skipped_count=0
	local failed_count=0

	for raw in "${TARGETS[@]}"; do
		local target="$raw"
		target="${target#./}"

		if [[ ! -e "$target" ]]; then
			echo "Skip (missing): $target"
			skipped_count=$((skipped_count + 1))
			continue
		fi

		local backup_path="$files_root/$target"
		echo "Delete: $target"

		if [[ "$DRY_RUN" -eq 1 ]]; then
			echo "  [dry-run] backup -> $backup_path"
			echo "  [dry-run] delete -> $target"
			deleted_count=$((deleted_count + 1))
			continue
		fi

		mkdir -p "$(dirname "$backup_path")"
		cp -a -- "$target" "$backup_path"

		if is_git_repo && is_tracked_file "$target"; then
			if ! git rm -f -- "$target" >/dev/null; then
				echo "  Failed tracked delete: $target" >&2
				failed_count=$((failed_count + 1))
				continue
			fi
		else
			if ! rm -rf -- "$target"; then
				echo "  Failed delete: $target" >&2
				failed_count=$((failed_count + 1))
				continue
			fi
		fi

		printf "%s\t%s\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$target" "$backup_path" >>"$log_file"
		deleted_count=$((deleted_count + 1))
	done

	echo "Delete summary: deleted=$deleted_count skipped=$skipped_count failed=$failed_count"
	if [[ "$DRY_RUN" -eq 0 ]]; then
		echo "Session: $session_id"
		echo "Log: $log_file"
	fi
}

restore_session() {
	local session="$1"
	mkdir -p "$RESTORE_ROOT"

	if [[ "$session" == "latest" ]]; then
		session="$(resolve_latest_session)"
		if [[ -z "$session" ]]; then
			echo "No restore session available." >&2
			exit 1
		fi
	fi

	local session_dir="$RESTORE_ROOT/$session"
	local log_file="$session_dir/deletions.tsv"

	if [[ ! -f "$log_file" ]]; then
		echo "Restore log not found: $log_file" >&2
		exit 1
	fi

	local restored_count=0
	while IFS=$'\t' read -r deleted_at_utc original_path backup_path; do
		[[ "$deleted_at_utc" == "deleted_at_utc" ]] && continue
		[[ -z "$original_path" ]] && continue
		if [[ ! -e "$backup_path" ]]; then
			echo "Skip restore (backup missing): $original_path"
			continue
		fi

		echo "Restore: $original_path"
		if [[ "$DRY_RUN" -eq 1 ]]; then
			echo "  [dry-run] copy $backup_path -> $original_path"
		else
			mkdir -p "$(dirname "$original_path")"
			cp -a -- "$backup_path" "$original_path"
			if is_git_repo; then
				git add -A -- "$original_path" >/dev/null 2>&1 || true
			fi
		fi
		restored_count=$((restored_count + 1))
	done <"$log_file"

	echo "Restore summary: restored=$restored_count session=$session"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run)
		DRY_RUN=1
		shift
		;;
	--manifest)
		MANIFEST_FILE="${2:-}"
		if [[ -z "$MANIFEST_FILE" ]]; then
			echo "--manifest requires a file path" >&2
			exit 1
		fi
		shift 2
		;;
	--restore)
		MODE="restore"
		RESTORE_SESSION="${2:-}"
		if [[ -z "$RESTORE_SESSION" ]]; then
			echo "--restore requires a session id or 'latest'" >&2
			exit 1
		fi
		shift 2
		;;
	--list-sessions)
		MODE="list"
		shift
		;;
	--help|-h)
		usage
		exit 0
		;;
	--)
		shift
		while [[ $# -gt 0 ]]; do
			TARGETS+=("$1")
			shift
		done
		;;
	*)
		TARGETS+=("$1")
		shift
		;;
	esac
done

if [[ -n "$MANIFEST_FILE" ]]; then
	read_manifest_into_targets "$MANIFEST_FILE"
fi

case "$MODE" in
delete)
	delete_targets
	;;
restore)
	restore_session "$RESTORE_SESSION"
	;;
list)
	print_sessions
	;;
*)
	echo "Unknown mode: $MODE" >&2
	exit 1
	;;
esac
