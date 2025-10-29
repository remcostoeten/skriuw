This is a mono repository with two MVP's to see which technology we prefer. 

We are building a Tauri 2.0 application + React TypeScript and are testing *near instant*/local first/offline-like database solutions. 

The apps folder contains two directorie:

- apps/turso
- apps/instantdb

Requirements:
- A CRUD application that works on desktop and on web, deployed via Vercel. That has the same API/CRUD layer and the same database on both platforms. If I mutate something on the compiled dekstop app, and I refresh the web app, the changes should be reflected without having to run any custom logic. Only our queries and mutations, which should be exactly the same on both platforms.

In the turso directory we'll be creating a tauri 2.0 application that uses the following setup:

- Tauri 2.0
- React TypeScript
- Turso (LibSQL)
- Drizzle ORM
- Embedded replicas (local SQLite + cloud sync)

In the instantdb directory we'll be creating a tauri 2.0 application that uses the following setup:

- Tauri 2.0
- Create next.js app with TypeScript & Tailwind CSS
- InstantDB (Local first database)
- Add InstantDB SDK
- TypeScript first schema
- Offline support
- Optimistic updates
- Have a core useCreate, useUpdate, useRead and useDestroy hook, and utilizing those we create dedicated API hooks for whatever domain we are working on which might look something like this in case of a task creation:
- DB -> Schema -> useCreate() -> `modules/tasks/api/mutations/create.ts` which imports the useCreate hook and uses it to create a task in the database. -> `modules/tasks/api/queries/get-tasks.ts` which imports the useRead hook and uses it to get all tasks from the database, but this could also be get-task, or whatever query. -> `views/task-view.tsx` which imports the get-tasks query and uses it to get the tasks and displays them in a list. Or if it then becomes to complex
 we create components inbetween the view.

 For the tauri database you can run `python3 scripts/generate-turso-db.py` to generate the database and retrieve the db url and auth token to clipboard or cli. You will have to create the .env.

 For instantDB I have nothing setup yet.