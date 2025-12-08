## Introduction

This document defines the complete authentication integration specification for a Next.js App Router project using Drizzle ORM and BetterAuth. It guarantees deterministic, correct, non-hallucinatory output.

## Authentication Requirements

### 1. Email & Password

Use BetterAuth built-in email/password authentication:

```ts
emailAndPassword: { enabled: true }
```

### 2. OAuth Providers

Implement GitHub and Google with this exact documented structure:

```ts
socialProviders: { 
  github: { 
    clientId: process.env.GITHUB_CLIENT_ID!, 
    clientSecret: process.env.GITHUB_CLIENT_SECRET!, 
    redirectURI: `${process.env.BETTER_AUTH_URL}/api/auth/callback/github` 
  }, 
  google: { 
    clientId: process.env.GOOGLE_CLIENT_ID!, 
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!, 
    redirectURI: `${process.env.BETTER_AUTH_URL}/api/auth/callback/google` 
  } 
}
```

### 3. Anonymous Login (Guest Accounts)

Use the official BetterAuth plugin:

```ts
import anonymous from "better-auth/plugins";
plugins: [anonymous(onLinkAccount: async (anonymousUser, newUser) => // optional: migrate guest data)]
```

Guest → full upgrade behavior must be preserved.

## Database Setup (Drizzle ORM, PostgreSQL Only)

Use postgres-js and Drizzle:

```ts
import drizzle from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, schema);
```

## BetterAuth Server Configuration

File: `src/lib/auth.ts`

```ts
import betterAuth from "better-auth";
import drizzleAdapter from "better-auth/adapters/drizzle";
import nextCookies from "better-auth/next-js";
import anonymous from "better-auth/plugins";
import db from "@/db";

export const auth = betterAuth(
  database: drizzleAdapter(db, provider: "pg"),
  emailAndPassword: enabled: true,
  socialProviders: github: ..., google: ...,
  plugins: [anonymous(), nextCookies()]
);
```

Required env vars:

* `BETTER_AUTH_SECRET`
* `BETTER_AUTH_URL`
* `GITHUB_CLIENT_ID`
* `GITHUB_CLIENT_SECRET`
* `GOOGLE_CLIENT_ID`
* `GOOGLE_CLIENT_SECRET`
* `DATABASE_URL`
* `NEXT_PUBLIC_APP_URL`

## Database Schema Requirements

Anonymous login requires:

```ts
isAnonymous: boolean("isAnonymous").default(false)
```

Add this to the user table in `src/db/schema.ts`.

## API Route

File: `src/app/api/auth/[...all]/route.ts`

```ts
import auth from "@/lib/auth";
import toNextJsHandler from "better-auth/next-js";

export const GET, POST = toNextJsHandler(auth);
```

## Auth Client Setup

File: `src/lib/auth-client.ts`

```ts
import createAuthClient from "better-auth/react";
import anonymousClient from "better-auth/client/plugins";

export const authClient = createAuthClient(
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [anonymousClient()]
);
```

## Required UI Components

### 7.1 AuthForm

Must support:

* `authClient.signIn.email()`
* `authClient.signUp.email()`
* `authClient.signIn.social(provider: "github")`
* `authClient.signIn.social(provider: "google")`
* `authClient.signIn.anonymous()`
* `authClient.signOut()`

### 7.2 UserMenu

Shows user avatar, email, or guest indicator.

Must use `router.refresh()` after auth-changing actions.

### 7.3 Pages

Files to generate:

* `src/app/(auth)/sign-in/page.tsx`
* `src/app/(auth)/sign-up/page.tsx`

Styled with Tailwind + Shadcn UI.

## Anonymous Session Behavior

When a user signs in anonymously:

* User row created
* `isAnonymous = true`
* Placeholder email assigned
* Session cookie created

When upgrading:

* Placeholder email replaced
* Anonymous user deleted (default)
* Session preserved

Support optional:

```ts
anonymous(onLinkAccount: async (anonymousUser, newUser) => )
```

## Permission Model (Future)

Anonymous users must be distinguishable via:

```ts
user.isAnonymous === true
```

LLM must structure code to allow future roles/permissions without rewriting modules.

## Project Structure Rules

LLM must place code only inside these paths:

* `app/api/auth/[...all]/`
* `app/(auth)/sign-in/`
* `app/(auth)/sign-up/`
* `lib/auth.ts`
* `lib/auth-client.ts`
* `db/schema.ts`
* `features/auth/**`

No files may be placed outside this structure unless explicitly asked.

## Strict Rules

You MUST:

* Use only documented BetterAuth APIs
* Not hallucinate any fields or providers
* Follow Next.js App Router rules
* Use Tailwind + Shadcn UI
* Trigger `router.refresh()` after sign-in / sign-out
* Generate type-safe env config

## Output Expectation

LLM must output:

* Updated Drizzle schema
* Full BetterAuth server config
* Full BetterAuth client config
* API route file
* Sign-in + Sign-up pages
* Anonymous login button
* UserMenu
* Upgrade flow
* All code compiling under Next.js 15+