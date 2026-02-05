# Feature Implementation: User Onboarding Flow

## 1. Deep Dive Architecture Audit

- **Current State**:
    - Auth (NextAuth/Auth.js) works, but "New Users" are indistinguishable from "Returning Users" beyond the creation timestamp.
    - `packages/db/src/schema.ts` shows a `user` table, but NO `hasOnboarded` or `onboardingStatus` column.
    - **Gap**: There is no persistence for "Does this user know how to use the app?". Redirects currently rely on non-existent logic.
- **Risk**:
    - **Infinite Redirect Loop**: If middleware checks `!onboarded` -> redirect `/welcome`. If `/welcome` API fails to update `onboarded` -> User is stuck forever.
    - **Data Consistency**: User might start onboarding, upload an avatar, then close the tab. Is the profile half-updated?
- **Edge Cases**:
    - **Guest Users**: A guest user (local only) might convert to a Cloud User later. Do they see onboarding again?
    - **Mobile**: The onboarding carousel must be swipeable on touch devices.

## 2. Objective

Create a **Resilient Onboarding System** that:

1.  Tracks user progress reliably (Schema Update).
2.  Intercepts new users via Middleware (without blocking API routes).
3.  Collecting critical preferences (Theme, Name, Defaults) _before_ dropping them into the app.

## 3. Detailed Implementation Specs

### A. Database Migration (`packages/db`)

- Update `user` table in `schema.ts`:
    ```typescript
    onboardingStatus: text('onboarding_status').default('pending') // 'pending' | 'completed' | 'skipped'
    ```
- Why not boolean? Future proofing. We might want a 'v2_onboarding' later.

### B. The Middleware Interceptor (`middleware.ts`)

- **Logic**:
    - Fetch `session`.
    - If `session.user.onboardingStatus === 'pending'`, and path is NOT `/welcome` (and not static asset/API), redirect to `/welcome`.
- **Performance**: Middleware runs on Edge. Reading DB might be slow/impossible depending on adapter.
- **Alternative (Recommended)**: Client-side check in `AppLayout` or `DashboardLayout`.
    - `if (user.onboardingStatus === 'pending') return <OnboardingOverlay />`
    - This avoids Edge DB limits and prevents flash-of-content.

### C. The Onboarding Flow UI (`features/onboarding/WelcomeFlow.tsx`)

A linear wizard state machine:

**Step 1: The "Hype" (Welcome)**

- Simple animation (Framer Motion).
- "Let's set up your digital workspace."

**Step 2: Identity (Profile)**

- Input: Name, Handle (if applicable).
- Avatar: Use `useUpload` to upload to `uploadthing` or Local.
- _Edge Case_: Handle upload failure gracefully. Allow "Skip for now".

**Step 3: Aesthetics (Theme)**

- Show 3 cards: Light, Dark, System.
- _Instant Preview_: Clicking a card should immediately toggle the app's Tailwind theme class to preview.

**Step 4: Defaults (The "Skriuw" Touch)**

- Set `noteCreationMode` (Simple vs Rich) - _links to Settings_.
- Set `defaultEmoji`.

**Step 5: Completion**

- API Call: `POST /api/user/complete-onboarding`.
- Updates `onboardingStatus` -> `completed`.
- Redirect to `/` (Dashboard).

## 4. Work Checklist

- [ ] **Schema**: Add `onboardingStatus` to `user` table (create migration).
- [ ] **API**: Create `app/api/user/onboarding/route.ts` to handle the batch update of preferences.
- [ ] **Feature**: Build `features/onboarding` components (use `framer-motion` for smooth transitions).
- [ ] **Integration**: Add the `OnboardingGuard` component to the main dashboard layout.
