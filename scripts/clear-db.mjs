
import 'dotenv/config';

const { NEXT_PUBLIC_INSTANT_APP_ID: INSTANT_APP_ID } = process.env;

async function clearDB() {
  if (!INSTANT_APP_ID) {
    throw new Error('INSTANT_APP_ID is not defined');
  }

  console.log('⚠️  Automatic database clearing is currently disabled.');
  console.log('');
  console.log('To clear your InstantDB database manually:');
  console.log(`1. Visit: https://instantdb.com/dash/app/${INSTANT_APP_ID}`);
  console.log('2. Navigate to your app dashboard');
  console.log('3. Use the data viewer to select and delete all records');
  console.log('4. Or look for a "Clear Database" option in the dashboard');
  console.log('');
  console.log('This is the safest way to ensure all data is properly removed.');
  console.log('');

  console.log('🔧 Alternative: If you need programmatic clearing, you can:');
  console.log('1. Start the dev server (bun run dev)');
  console.log('2. Add a temporary clear button to your React app');
  console.log('3. Use the existing db.transact() and db.tx.*.delete() methods');
  console.log('4. Remove the temporary button after clearing');
}

clearDB().catch(console.error);
