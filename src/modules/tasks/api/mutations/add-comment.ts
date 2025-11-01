import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { generateId } from 'utils';

type props = {
    taskId: string;
    body: string;
};

export function useAddTaskComment() {
    const { mutate, isLoading, error } = useMutation(async (input: props) => {
        const id = generateId();
        const activityId = generateId();
        const now = Date.now();
        await transact([
            tx.comments[id].update({ body: input.body, createdAt: now }),
            tx.comments[id].link({ task: input.taskId }),
            tx.activity[activityId].update({
                type: 'comment_added',
                message: 'Comment added',
                createdAt: now,
            }),
            tx.activity[activityId].link({ task: input.taskId }),
        ]);
        return { id };
    });

    return { addComment: mutate, isLoading, error };
}


