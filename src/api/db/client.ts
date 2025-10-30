import { init } from '@instantdb/react';
import { schema, type Schema } from './schema';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;

if (!APP_ID) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID is not defined');
}

export const db = init<Schema>({
  appId: APP_ID,
  schema,
});

export const { transact, useQuery, useAuth, tx } = db;

