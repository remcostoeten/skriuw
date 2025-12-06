# GEMINI.md

## Project Overview

This is a monorepo for **Skriuw**, a local-first desktop application for writing and organizing thoughts. It's built with a modern tech stack that includes:

*   **Tauri 2.0:** For building the cross-platform desktop application.
*   **React:** For the user interface.
*   **Next.js:** As the React framework.
*   **Turborepo:** For managing the monorepo.
*   **Bun:** As the package manager and runtime.
*   **PostgreSQL:** As the database.
*   **Drizzle ORM:** For interacting with the database.

The project is structured as a monorepo with the following packages:

*   `apps/web`: The main Next.js web application.
*   `packages/db`: The database schema and utilities.
*   `packages/ui`: Shared UI components.
*   `packages/core-logic`: Core business logic.

## Building and Running

The project uses `bun` as the package manager.

*   To install dependencies, run:
    ```bash
    bun install
    ```

*   To start the development server, run:
    ```bash
    bun run dev
    ```

*   To build the project for production, run:
    ```bash
    bun run build
    ```

## Development Conventions

*   **Linting:** The project uses ESLint for linting. To run the linter, use `bun run lint`.
*   **Formatting:** The project uses Prettier for code formatting. To format the code, use `bun run format`.
*   **Type Checking:** The project uses TypeScript for type checking. To check for type errors, use `bun run check-types`.
*   **Database Migrations:** The project uses Drizzle ORM for database migrations.
    *   To generate migrations, run: `bun run db:generate`.
    *   To apply migrations, run: `bun run db:push`.
    *   To open the Drizzle Studio, run: `bun run db:studio`.
