# Authentication System

## User Types

We support three distinct user types with different authentication levels and capabilities:

### 1. Zero-Session User (Analytics Only)

- Entry point for all application visits
- Generates unique session ID with geolocation data
- Stored in database exclusively for analytics tracking
- **Can edit preseeded notes for themselves** (edits stored in local storage only)
- Login popup appears every Nth request to encourage authentication
- Remains an ephemeral entity until explicit authentication action
- No backend storage - all changes persist only in browser session

### 2. Anonymous User (Test Mode)

- Triggered when user selects "login anonymous"
- Converts existing zero-session into a proper user record
- Full application functionality EXCEPT:
    - All API mutations (write operations) are stored exclusively in local storage
    - Data cleared automatically after configured time period
- Designed for application testing without commitment

### 3. Authenticated User (Full Access)

- Standard authentication via email/password or OAuth providers
- Complete system permissions
- Persistent data storage in backend
- Full account lifecycle management

## User Flow

```
Visit Application
    ↓
Generate Zero-Session (UUID + Geodata)
    ↓
User Action Choice:
    ├─ Continue browsing → Remains zero-session
    ├─ Login anonymous → Create User Record from Session → Local storage mutations
    └─ Login with credentials → Full authenticated user → Backend persistence
```

## Implementation Details

### Zero-Session Creation

- Unique UUID generated on first visit
- Geolocation data captured for analytics
- Session entity created in database
- No user account or authentication state
- Preseeded notes/folders automatically created for demo experience

### Zero-Session Editing Capability

Zero-session users can edit preseeded notes with the following constraints:

```typescript
editNote(noteId, content) {
  if (isZeroSession) {
    // Store in local storage only
    localStorage.setItem(`note_${noteId}`, content)
    return true
  }
  // Authenticated users save to backend
  return saveToBackend(noteId, content)
}
```

**Behavior:**

- Edits persist only in browser local storage
- Edits are lost when session ends or browser clears
- No backend storage or persistence across sessions
- Demonstrates application functionality without commitment

### Login Popup Nth-Request Trigger

Zero-session users receive periodic login prompts to encourage authentication:

```typescript
function checkAndShowLoginPopup(requestCount) {
	const NthRequest = 5 // Show popup every 5th request
	const popupShown = sessionStorage.getItem('loginPopupShown')
	const lastShownAt = parseInt(sessionStorage.getItem('lastPopupShownAt') || '0')
	const oneHourAgo = Date.now() - 60 * 60 * 1000

	if (requestCount % NthRequest === 0 && Date.now() > lastShownAt + oneHourAgo) {
		showLoginPrompt()
		sessionStorage.setItem('loginPopupShown', 'true')
		sessionStorage.setItem('lastPopupShownAt', Date.now().toString())
	}
}
```

**Behavior:**

- Popup appears every Nth request (configurable, default: 5)
- Minimum one hour interval between popups
- Non-intrusive design (can be dismissed)
- Tracks request count per session
- Shows different CTAs: "Sign in to save your work" or "Create account"

### Anonymous User Conversion

```typescript
createUser(Anonymous) {
  // Assumes zero-session exists
  // Creates user record linked to session
  // Enables all features with local storage persistence
  // Auto-clears after N hours
}
```

### Authenticated User Flow

- OAuth or email/password verification
- Creates or retrieves existing user record
- Establishes persistent session
- Full backend data access

## Initial Data Preseeding

**CRITICAL: Every user type MUST receive preseeded notes and folders programmatically**

### Preseeding Requirements

1. **Zero-Session Users**
    - Upon session creation, automatically preseed with default notes/folders
    - Data stored temporarily in session context
    - Demonstrates application functionality immediately

2. **Anonymous Users**
    - Preseed occurs during user record creation from zero-session conversion
    - Notes/folders stored in local storage
    - Ensures consistent testing experience

3. **Authenticated Users**
    - Preseed executed on first-time user creation
    - Persistent storage in backend database
    - Onboarding experience for new accounts

### Implementation Notes

- Preseeding logic should be triggered immediately after user/session creation
- Use consistent default note structure across all user types
- Ensure preseeded content aligns with application's intended use case
- Programmatic preseeding applies to ALL users, regardless of authentication level
