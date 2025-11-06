/**
 * Selects an array of entities from query result
 * @param entityName - The name of the entity in the query result
 * @returns Selector function that extracts array from raw query result
 */
export function selectArray<T>(entityName: string) {
  return (raw: any): T[] => (raw?.[entityName] as T[]) ?? [];
}

/**
 * Selects a single entity from query result
 * @param entityName - The name of the entity in the query result
 * @returns Selector function that extracts single entity or null
 */
export function selectSingle<T>(entityName: string) {
  return (raw: any): T | null => (raw?.[entityName]?.[0] as T) ?? null;
}

/**
 * Selects first entity or undefined
 * @param entityName - The name of the entity in the query result
 * @returns Selector function that extracts first entity or undefined
 */
export function selectFirst<T>(entityName: string) {
  return (raw: any): T | undefined => raw?.[entityName]?.[0] as T | undefined;
}

/**
 * Creates standard options for array queries
 * @param entityName - The name of the entity in the query result
 * @returns Query options with select and initialData
 */
export function arrayQueryOptions<T>(entityName: string) {
  return {
    select: selectArray<T>(entityName),
    initialData: [] as T[],
  };
}

/**
 * Creates standard options for single entity queries
 * @param entityName - The name of the entity in the query result
 * @returns Query options with select and initialData
 */
export function singleQueryOptions<T>(entityName: string) {
  return {
    select: selectSingle<T>(entityName),
    initialData: null as T | null,
  };
}

