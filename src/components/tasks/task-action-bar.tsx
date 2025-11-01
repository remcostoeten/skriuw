import { useCreateProject } from "@/modules/projects/api/mutations/create";
import { useCreateTask } from "@/modules/tasks/api/mutations/create";
import { BaseActionBar } from "@/shared/components/base-action-bar";
import { CheckSquare2, CircleAlert, Clock, Flame, FolderPlus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type props = {
    onCreateTask: (priority?: 'low' | 'med' | 'high' | 'urgent') => void;
    selectedProjectId?: string | null;
}

export function TaskActionBar({
    onCreateTask,
    selectedProjectId,
}: props) {
    const { createTask } = useCreateTask();
    const { createProject } = useCreateProject();
    const [newProjectTitle, setNewProjectTitle] = useState('');

    const handleNewTask = useCallback(async (priority?: 'low' | 'med' | 'high' | 'urgent') => {
        try {
            await createTask({
                content: 'New Task',
                position: Date.now(),
                priority: priority ?? 'med',
                projectId: selectedProjectId || undefined,
            });
            onCreateTask(priority);
        } catch (error) {
            console.error("Failed to create task:", error);
        }
    }, [createTask, onCreateTask, selectedProjectId]);

    const handleNewUrgentTask = useCallback(() => handleNewTask('urgent'), [handleNewTask]);
    const handleNewHighTask = useCallback(() => handleNewTask('high'), [handleNewTask]);
    const handleNewTaskDefault = useCallback(() => handleNewTask('med'), [handleNewTask]);
    const handleNewLowTask = useCallback(() => handleNewTask('low'), [handleNewTask]);

    const handleProjectClose = useCallback(() => {
        setNewProjectTitle('');
    }, []);

    const handleCreateProject = useCallback(async () => {
        if (!newProjectTitle.trim()) return;
        try {
            await createProject({
                title: newProjectTitle.trim(),
                status: 'active',
            });
            setNewProjectTitle('');
        } catch (error) {
            console.error("Failed to create project:", error);
        }
    }, [createProject, newProjectTitle]);

    const urgentIcon = useMemo(() => <Flame className="w-[18px] h-[18px]" />, []);
    const highIcon = useMemo(() => <CircleAlert className="w-[18px] h-[18px]" />, []);
    const defaultIcon = useMemo(() => <CheckSquare2 className="w-[18px] h-[18px]" />, []);
    const lowIcon = useMemo(() => <Clock className="w-[18px] h-[18px]" />, []);
    const folderPlusIcon = useMemo(() => <FolderPlus className="w-[18px] h-[18px]" />, []);

    const buttons = useMemo(() => [
        {
            icon: urgentIcon,
            tooltip: "New Urgent Task",
            onClick: handleNewUrgentTask,
        },
        {
            icon: highIcon,
            tooltip: "New High Priority Task",
            onClick: handleNewHighTask,
        },
        {
            icon: defaultIcon,
            tooltip: "New Task",
            onClick: handleNewTaskDefault,
        },
        {
            icon: lowIcon,
            tooltip: "New Low Priority Task",
            onClick: handleNewLowTask,
        },
    ], [handleNewUrgentTask, handleNewHighTask, handleNewTaskDefault, handleNewLowTask, urgentIcon, highIcon, defaultIcon, lowIcon]);

    const inputConfig = useMemo(() => ({
        value: newProjectTitle,
        setValue: setNewProjectTitle,
        placeholder: "Project name...",
        close: handleProjectClose,
        onSubmit: handleCreateProject,
        showCloseButton: true,
        buttonIcon: folderPlusIcon,
        buttonTooltip: "New Project",
    }), [newProjectTitle, handleProjectClose, handleCreateProject, folderPlusIcon]);

    return (
        <BaseActionBar
            buttons={buttons}
            inputConfig={inputConfig}
        />
    );
}

