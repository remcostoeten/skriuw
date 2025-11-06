import { createQueryHook } from '@/hooks/core';
import type { UserSetting } from '@/api/db/schema';
import { singleQueryOptions } from '@/shared/utilities/query-helpers';

const useUserSettingQuery = createQueryHook(
  (key: string) => ({
    userSettings: {
      $: {
        where: { key },
        limit: 1,
      },
    },
  }),
  {
    ...singleQueryOptions<UserSetting>('userSettings'),
    showErrorToast: false,
  }
);

export function useGetUserSetting(key: string) {
  const { data, isLoading, error } = useUserSettingQuery(key);
  return { setting: data, isLoading, error };
}


