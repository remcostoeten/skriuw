'use client';

import type { Task } from '@/api/db/schema';
import { TaskSidebar } from '@/components/tasks/task-sidebar';
import { useCreateTask } from '@/modules/tasks/api/mutations/create';
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks';
import { TaskList } from '@/modules/tasks/components/task-list';
import { applyList } from '@/modules/tasks/utils/saved-filters';
import { filterTasks, sortTasks, TaskFilter, TaskSort } from '@/modules/tasks/utils/sort-filter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { DockManager } from '@/utils/dock-utils';
import { Filter } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export function TasksView() {
    const { createTask } = useCreateTask();
    const { tasks: allTasks, isLoading: tasksLoading } = useGetAllTasks();

    const [selectedQuickFilter, setSelectedQuickFilter] = useState<string | null>(null);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [priorityFilter, setPriorityFilter] = useState<Task['priority'] | 'all'>('all');
    const [sortBy, setSortBy] = useState<TaskSort>('createdAt');
    const [showCompleted, setShowCompleted] = useState(true);

    const isLoading = tasksLoading;

    // Filter tasks based on current filters
    const filteredTasks = useMemo(() => {
        let filtered = [...allTasks];

        if (selectedProjectId) {
            filtered = filtered.filter(t => t.project?.id === selectedProjectId);
        }

        if (selectedQuickFilter && selectedQuickFilter !== 'all') {
            filtered = applyList(filtered, selectedQuickFilter);
        }

        // Apply completion filter
        if (!showCompleted) {
            filtered = filtered.filter(t => !t.completed);
        }

        // Apply priority filter
        const taskFilter: TaskFilter = {};
        if (priorityFilter !== 'all') {
            taskFilter.priorities = [priorityFilter];
        }

        filtered = filterTasks(filtered, taskFilter);

        // Only apply sort if not using a quick filter (quick filters have their own sort)
        if (!selectedQuickFilter || selectedQuickFilter === 'all') {
            filtered = sortTasks(filtered, sortBy);
        }

        return filtered;
    }, [allTasks, selectedQuickFilter, selectedProjectId, priorityFilter, showCompleted, sortBy]);

    // Update dock badge with total task count
    useEffect(() => {
        DockManager.setBadge(allTasks.filter(t => !t.completed).length || 0);
    }, [allTasks]);


    const nextTaskPosition = useMemo(() => {
        if (!filteredTasks || filteredTasks.length === 0) return 0;
        return filteredTasks.reduce((max, t) => (t.position > max ? t.position : max), 0) + 1;
    }, [filteredTasks]);

    async function handleCreateTask() {
        try {
            await createTask({
                content: 'New Task',
                position: nextTaskPosition,
                projectId: selectedProjectId || undefined,
            });
        } catch (error) {
            console.error('Failed to create task:', error);
        }
    }

    function handleClearFilters() {
        setSelectedQuickFilter(null);
        setSelectedProjectId(null);
        setPriorityFilter('all');
        setShowCompleted(true);
    }

    function handleQuickFilterSelect(filterId: string | null) {
        setSelectedQuickFilter(filterId);
    }

    function handleProjectSelect(projectId: string | null) {
        setSelectedProjectId(projectId);
    }

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background">
            {/* Task Sidebar */}
            <TaskSidebar
                onFilterSelect={handleQuickFilterSelect}
                onProjectSelect={handleProjectSelect}
                selectedFilterId={selectedQuickFilter}
                selectedProjectId={selectedProjectId}
            />

            <div className="flex-1 flex flex-col bg-background relative ml-[220px]">
                <div className="flex-1 relative px-8 py-6 overflow-y-auto scrollbar-content">
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-6">
                            <h1 className="text-2xl font-semibold mb-2 text-foreground">Tasks & Issues</h1>
                            <p className="text-sm text-muted-foreground">
                                Manage project tasks and issues
                            </p>
                        </div>

                        {/* Filter Controls */}
                        <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border/50">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">Filters:</span>
                                </div>

                                <Select
                                    value={priorityFilter}
                                    onValueChange={(value) => setPriorityFilter(value as Task['priority'] | 'all')}
                                >
                                    <SelectTrigger className="w-32 h-8 text-sm">
                                        <SelectValue placeholder="All Priorities" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Priorities</SelectItem>
                                        <SelectItem value="urgent">Urgent</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="med">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={sortBy}
                                    onValueChange={(value) => setSortBy(value as TaskSort)}
                                >
                                    <SelectTrigger className="w-36 h-8 text-sm">
                                        <SelectValue placeholder="Sort by Created" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="createdAt">Sort by Created</SelectItem>
                                        <SelectItem value="priority">Sort by Priority</SelectItem>
                                        <SelectItem value="dueAt">Sort by Due Date</SelectItem>
                                        <SelectItem value="position">Sort by Position</SelectItem>
                                    </SelectContent>
                                </Select>

                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={showCompleted}
                                        onChange={(e) => setShowCompleted(e.target.checked)}
                                        className="rounded"
                                    />
                                    Show completed
                                </label>

                                {(selectedQuickFilter || selectedProjectId || priorityFilter !== 'all' || !showCompleted) && (
                                    <button
                                        onClick={handleClearFilters}
                                        className="text-xs text-muted-foreground hover:text-foreground underline"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
                            <span>Total: {allTasks.length}</span>
                            <span>Active: {allTasks.filter(t => !t.completed).length}</span>
                            {selectedQuickFilter && <span>Filtered: {filteredTasks.length}</span>}
                        </div>

                        {/* Task List */}
                        <TaskList noteId={null} tasks={filteredTasks} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TasksView;


