import { useGetUserSetting } from '@/modules/settings/api/queries/get-user-setting';
import { useUpdateUserSetting } from '@/modules/settings/api/mutations/update-user-setting';
import { useCallback } from 'react';

/**
 * Hook to get and set a user setting by key
 * @param key - The setting key identifier
 * @param defaultValue - Default value if setting doesn't exist
 * @returns [value, setValue, isLoading, error]
 */
export function useUserSetting<T = any>(key: string, defaultValue: T) {
  const { setting, isLoading, error } = useGetUserSetting(key);
  const { updateSetting, isLoading: isUpdating } = useUpdateUserSetting();

  const value = setting?.value !== undefined ? (setting.value as T) : defaultValue;

  const setValue = useCallback(
    async (newValue: T) => {
      await updateSetting({ key, value: newValue });
    },
    [key, updateSetting]
  );

  return [value, setValue, isLoading || isUpdating, error] as const;
}


