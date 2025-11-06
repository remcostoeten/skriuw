import { useMutation } from '@/hooks/core';
import { transact, tx, db } from '@/api/db/client';
import { generateId } from 'utils';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
  key: string;
  value: any;
};

export function useUpdateUserSetting() {
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    // First, try to find existing setting
    const result = await db.queryOnce({
      userSettings: {
        $: {
          where: { key: input.key },
          limit: 1,
        },
      },
    });

    const existingSetting = result?.data?.userSettings?.[0];

    if (existingSetting) {
      // Update existing setting
      await transact([
        tx.userSettings[existingSetting.id].update(withTimestamps({
          value: input.value,
        })),
      ]);
      return { id: existingSetting.id, ...input };
    } else {
      // Create new setting
      const id = generateId();
      await transact([
        tx.userSettings[id].update(withTimestamps({
          key: input.key,
          value: input.value,
        }, true)),
      ]);
      return { id, ...input };
    }
  });

  return { updateSetting: mutate, isLoading, error };
}

