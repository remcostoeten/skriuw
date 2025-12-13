
import { getDatabase, notes, folders, tasks, settings, shortcuts } from './index';

async function main() {
    console.log('Testing database connection...');
    try {
        const db = getDatabase();
        console.log('Database client obtained.');

        // Test simple query
        console.log('Running SELECT 1...');
        // @ts-expect-error Drizzle client execute not typed for raw SQL in this test
        const result = await db.execute('SELECT 1');
        console.log('SELECT 1 success:', result);

        // Test the queries from the route
        console.log('Testing route queries...');
        const [noteRows, folderRows, taskRows, settingRows, shortcutRows] = await Promise.all([
            db.select().from(notes),
            db.select().from(folders),
            db.select().from(tasks),
            db.select().from(settings),
            db.select().from(shortcuts),
        ]);

        console.log('Route queries success!');
        console.log('Notes:', noteRows.length);
        console.log('Folders:', folderRows.length);
        console.log('Tasks:', taskRows.length);
        console.log('Settings:', settingRows.length);
        console.log('Shortcuts:', shortcutRows.length);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
