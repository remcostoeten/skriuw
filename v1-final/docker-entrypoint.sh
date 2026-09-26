#!/bin/sh
set -e

fail() {
	echo "ERROR: $1" >&2
	echo "       See .env.example and the README 'Self-host with Docker' section." >&2
	exit 1
}

# A required secret is unusable if it's empty, still a placeholder from
# .env.example, or too short to be a real 32-char secret.
require_secret() {
	name="$1"
	value="$2"
	case "$value" in
	"") fail "$name is not set." ;;
	*placeholder* | *generate-* | your-*) fail "$name is still a placeholder — set a real value." ;;
	esac
	if [ "${#value}" -lt 32 ]; then
		fail "$name must be at least 32 characters (openssl rand -base64 32)."
	fi
}

[ -n "$DATABASE_URL" ] || fail "DATABASE_URL is not set."
require_secret "BETTER_AUTH_SECRET" "$BETTER_AUTH_SECRET"
require_secret "AI_KEYS_ENCRYPTION_SECRET" "$AI_KEYS_ENCRYPTION_SECRET"

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy --config prisma.config.ts

exec "$@"
