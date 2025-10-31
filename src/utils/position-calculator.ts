import type { Folder, Note } from '@/api/db/schema';

type PositionCalcInput = {
    siblingItems: (Note | Folder)[];
    position: 'before' | 'after' | 'inside';
    targetIndex: number;
};

export const calculateNewPosition = ({
    siblingItems,
    position,
    targetIndex,
}: PositionCalcInput): number => {
    const sorted = siblingItems.sort((a, b) => (a.position || 0) - (b.position || 0));

    if (targetIndex === -1 || sorted.length === 0) {
        return 0;
    }

    const targetPosition = sorted[targetIndex].position || 0;

    if (position === 'inside') {
        return (sorted[sorted.length - 1].position || 0) + 1;
    }

    if (position === 'before') {
        const prevPosition = targetIndex > 0 ? sorted[targetIndex - 1].position || 0 : 0;
        return (prevPosition + targetPosition) / 2;
    }

    const nextPosition =
        targetIndex < sorted.length - 1
            ? sorted[targetIndex + 1].position || 0
            : targetPosition + 2;

    return (targetPosition + nextPosition) / 2;
};
