import { createQueryHook } from '@/hooks/core';
import type { UserSetting } from '@/api/db/schema';

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
    select: (raw) => {
      const settings = raw?.userSettings as UserSetting[] | undefined;
      return settings && settings.length > 0 ? settings[0] : null;
    },
    initialData: null as UserSetting | null,
    showErrorToast: false,
  }
);

export function useGetUserSetting(key: string) {
  const { data, isLoading, error } = useUserSettingQuery(key);
  return { setting: data, isLoading, error };
}


