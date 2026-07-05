# Error Handling Quick Fixes

**Priority:** 🚨 HIGH — Do these first before any Rust offload work

## Fix #1: Editor JSON Serialization Crash

**File:** `apps/web/src/domain/notes/rich-document.ts:1012`

```typescript
// BEFORE (UNSAFE)
export function cloneRichDocument(document: Block[]): Block[] {
	return JSON.parse(JSON.stringify(document));
}

// AFTER (SAFE)
export function cloneRichDocument(document: Block[]): Block[] {
	try {
		return JSON.parse(JSON.stringify(document));
	} catch (err) {
		console.error("[cloneRichDocument] Serialization failed:", err);
		// Return deep copy fallback or throw with context
		return document.map((block) => structuredClone(block));
	}
}
```

**Also add to editor component:**

```typescript
// Add Error Boundary in rich-text-editor.tsx or parent
<ErrorBoundary onError={(err) => {
  analytics.track('editor_crash', { error: err.message });
  showErrorNotification('Editor error: Could not save note');
}}>
  <RichTextEditor {...props} />
</ErrorBoundary>
```

---

## Fix #2: AI Key Decryption Failure

**File:** `apps/web/src/domain/ai/provider-keys.ts:152`

```typescript
// BEFORE (UNSAFE)
export async function getDecryptedAiProviderKey(
  providerId: string
): Promise<string | null> {
  const encrypted = await db.query(...);
  if (!encrypted) return null;

  return decryptApiKey(encrypted); // Can throw!
}

// AFTER (SAFE)
export async function getDecryptedAiProviderKey(
  providerId: string
): Promise<string | null> {
  try {
    const encrypted = await db.query(...);
    if (!encrypted) return null;

    return decryptApiKey(encrypted);
  } catch (err) {
    console.error('[getDecryptedAiProviderKey] Decryption failed:', err);
    throw new ApiKeyDecryptionError(
      `Cannot retrieve ${providerId} key. Key may be corrupted.`,
      { cause: err }
    );
  }
}
```

---

## Fix #3: Promise.all to Promise.allSettled

**File:** Various query hooks (use-debounced-save.ts, tag queries, etc.)

```typescript
// BEFORE (UNSAFE - one failure fails all)
const [notes, tags, folders] = await Promise.all([fetchNotes(), fetchTags(), fetchFolders()]);

// AFTER (SAFE - partial success)
const results = await Promise.allSettled([fetchNotes(), fetchTags(), fetchFolders()]);

const notes = results[0].status === "fulfilled" ? results[0].value : [];
const tags = results[1].status === "fulfilled" ? results[1].value : [];
const folders = results[2].status === "fulfilled" ? results[2].value : [];

if (results.some((r) => r.status === "rejected")) {
	console.error(
		"[DataSync] Partial failure:",
		results
			.filter((r) => r.status === "rejected")
			.map((r) => (r as PromiseRejectedResult).reason),
	);
	showWarning("Some data may be out of sync");
}
```

---

## Fix #4: Replace Silent Catch Blocks

**Files:** Multiple (use-debounced-save.ts, use-journal-entry.ts, etc.)

```typescript
// BEFORE (UNSAFE - silent failure)
try {
	await saveToDB(data);
} catch (err) {
	// Silent swallow - user thinks it saved!
}

// AFTER (SAFE - explicit error)
try {
	await saveToDB(data);
} catch (err) {
	console.error("[saveToDB] Failed to persist:", err);

	// User-facing error
	if (err instanceof NetworkError) {
		showWarning("Offline: Changes will sync when online");
	} else {
		showError("Failed to save note");
		analytics.track("save_failure", { error: err.message });
	}

	// Re-throw if critical, swallow if non-critical
	if (isCritical) throw err;
}
```

**Pattern to find:**

```bash
grep -rn "catch.*=>.*{}" apps/web/src --include="*.ts" --include="*.tsx"
```

---

## Fix #5: Validate JSON Before Parse

**File:** `apps/web/src/features/collaboration/lib/collab-token.ts:87`

```typescript
// BEFORE (UNSAFE)
export function decodeToken(token: string): TokenPayload {
	const body = fromBase64Url(token.split(".")[2]);
	const decoded = JSON.parse(decoder.decode(body));
	return decoded as TokenPayload;
}

// AFTER (SAFE)
export function decodeToken(token: string): TokenPayload {
	try {
		// Validate structure
		const parts = token.split(".");
		if (parts.length !== 3) {
			throw new Error("Invalid token format: expected 3 parts");
		}

		// Decode with error handling
		let body: Uint8Array;
		try {
			body = fromBase64Url(parts[2]);
		} catch (err) {
			throw new Error("Invalid base64 in token payload");
		}

		// Parse with error handling
		let payload: unknown;
		try {
			payload = JSON.parse(decoder.decode(body));
		} catch (err) {
			throw new Error("Token payload is not valid JSON");
		}

		// Validate schema
		const validated = TokenPayloadSchema.parse(payload);
		return validated;
	} catch (err) {
		throw new TokenValidationError(`Token validation failed: ${err.message}`);
	}
}
```

---

## Checklist

- [ ] Fix #1: Add try-catch + error boundary to editor
- [ ] Fix #2: Wrap decryptApiKey() with error handling
- [ ] Fix #3: Convert Promise.all to Promise.allSettled (find all instances)
- [ ] Fix #4: Replace all `.catch(() => {})` with proper error logging
- [ ] Fix #5: Validate JSON/crypto inputs before processing
- [ ] Add error types: `ApiKeyDecryptionError`, `TokenValidationError`, etc.
- [ ] Add error logging to analytics/sentry
- [ ] Test: Inject error scenarios to verify graceful failure
- [ ] Update error boundary UI to show helpful messages

---

## Testing Strategy

For each fix, create a test case that injects the failure:

```typescript
// Example: test cloneRichDocument with circular reference
const circular: any = { blocks: [] };
circular.blocks.push(circular); // Circular reference

expect(() => cloneRichDocument(circular)).toThrow();
// And verify error boundary catches it
```

---

## Estimated Effort

- Time: 4-6 hours
- Files to modify: ~8
- New error types: 3-4
- Test cases: 5-10

This is foundational work before any Rust offload — prevents data loss and improves reliability significantly.
