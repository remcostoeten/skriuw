import { useMutation } from '@/hooks/core';
import { transact, tx, db } from '@/api/db/client';
import { generateId } from 'utils';

type Props = {
  key: string;
  value: any;
};

export function useUpdateUserSetting() {
  const { mutate, isLoading, error } = useMutation(async (input: Props) => {
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
    const now = Date.now();

    if (existingSetting) {
      // Update existing setting
      await transact([
        tx.userSettings[existingSetting.id].update({
          value: input.value,
          updatedAt: now,
        }),
      ]);
      return { id: existingSetting.id, ...input };
    } else {
      // Create new setting
      const id = generateId();
      await transact([
        tx.userSettings[id].update({
          key: input.key,
          value: input.value,
          createdAt: now,
          updatedAt: now,
        }),
      ]);
      return { id, ...input };
    }
  });

  return { updateSetting: mutate, isLoading, error };
}

