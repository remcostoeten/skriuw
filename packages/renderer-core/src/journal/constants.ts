/**
 * Identities shared between the journal feature and the store projections
 * that hide its subtree. Kept dependency-free so `store/tree.ts` can import
 * them without pulling the journal UI into the tree layer.
 */
export const JOURNAL_ROOT_ID = "journal-root";
export const JOURNAL_ROOT_TITLE = "Journal";
export const JOURNAL_DATE_PROPERTY_ID = "journal-date";
export const JOURNAL_MOOD_PROPERTY_ID = "journal-mood";
