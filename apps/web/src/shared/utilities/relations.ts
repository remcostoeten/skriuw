import { tx } from '@/api/db/client';

/**
 * Updates a one-to-one or many-to-one relationship
 * @param entityName - The entity type (e.g., 'tasks', 'notes')
 * @param entityId - The entity ID
 * @param relationName - The relation field name
 * @param newId - New relation ID (null to unlink)
 * @returns Array of transaction operations
 */
export function updateRelation(
  entityName: string,
  entityId: string,
  relationName: string,
  newId: string | null
): any[] {
  const operations = [];
  
  // Unlink existing
  operations.push(
    tx[entityName as keyof typeof tx][entityId].unlink({
      [relationName]: null as any,
    })
  );
  
  // Link new if provided
  if (newId) {
    operations.push(
      tx[entityName as keyof typeof tx][entityId].link({
        [relationName]: newId,
      })
    );
  }
  
  return operations;
}

/**
 * Updates a many-to-many relationship
 * @param entityName - The entity type
 * @param entityId - The entity ID
 * @param relationName - The relation field name
 * @param newIds - Array of new relation IDs
 * @returns Array of transaction operations
 */
export function updateManyRelation(
  entityName: string,
  entityId: string,
  relationName: string,
  newIds: string[]
): any[] {
  const operations = [];
  
  // Unlink all existing
  operations.push(
    tx[entityName as keyof typeof tx][entityId].unlink({
      [relationName]: null as any,
    })
  );
  
  // Link new ones
  newIds.forEach(id => {
    operations.push(
      tx[entityName as keyof typeof tx][entityId].link({
        [relationName]: id,
      })
    );
  });
  
  return operations;
}


