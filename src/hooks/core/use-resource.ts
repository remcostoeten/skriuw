import { useCreate, useDestroy, useUpdate } from '@/hooks/core';

/** Config for `createResource`. */
export interface ResourceFactoryConfig<TCreate, TUpdate> {
  buildCreate?: (input: TCreate) => Record<string, any>;
  buildUpdate?: (input: TUpdate) => Record<string, any>;
}

/**
 * Creates typed hooks for a resource: create, update, destroy.
 */
export function createResource<TCreate extends Record<string, any>, TUpdate extends Record<string, any>>(
  entityName: string,
  config?: ResourceFactoryConfig<TCreate, TUpdate>
) {
  function useCreateResource() {
    const { create, isLoading, error } = useCreate(entityName);
    const createItem = async (id: string, input: TCreate) => {
      const payload = config?.buildCreate ? config.buildCreate(input) : input;
      return create(id, payload as any);
    };
    return { createItem, isLoading, error } as const;
  }

  function useUpdateResource() {
    const { update, isLoading, error } = useUpdate(entityName);
    const updateItem = async (id: string, input: TUpdate) => {
      const payload = config?.buildUpdate ? config.buildUpdate(input) : input;
      return update(id, payload as any);
    };
    return { updateItem, isLoading, error } as const;
  }

  function useDestroyResource() {
    const { destroy, isLoading, error } = useDestroy(entityName);
    const destroyItem = async (id: string) => destroy(id);
    return { destroyItem, isLoading, error } as const;
  }

  return { useCreateResource, useUpdateResource, useDestroyResource } as const;
}



