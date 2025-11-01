import { Button } from "@/shared/components/ui/button";
import { CheckSquare2, Plus, Target } from "lucide-react";

type EmptyStateProps = {
  type?: "all" | "filtered" | "note";
  onCreateTask?: () => void;
  hasFilters?: boolean;
};

export function EmptyState({
  type = "all",
  onCreateTask,
  hasFilters = false
}: EmptyStateProps) {
  const getEmptyStateContent = () => {
    switch (type) {
      case "note":
        return {
          icon: <CheckSquare2 className="w-12 h-12 text-muted-foreground" />,
          title: "No tasks for this note yet",
          description: "Create your first task for this note to start tracking your progress.",
          action: onCreateTask ? "Create First Task" : null
        };

      case "filtered":
        return {
          icon: <Target className="w-12 h-12 text-muted-foreground" />,
          title: "No tasks match your filters",
          description: hasFilters
            ? "Try adjusting your filters or project selection to see more tasks."
            : "No tasks found with the current criteria.",
          action: onCreateTask ? "Create New Task" : null
        };

      default:
        return {
          icon: <CheckSquare2 className="w-12 h-12 text-muted-foreground" />,
          title: "No tasks yet",
          description: "Get started by creating your first task. You can organize them by project and priority.",
          action: onCreateTask ? "Create First Task" : null
        };
    }
  };

  const content = getEmptyStateContent();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4">
        {content.icon}
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {content.title}
      </h3>

      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        {content.description}
      </p>

      {content.action && onCreateTask && (
        <Button
          onClick={onCreateTask}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {content.action}
        </Button>
      )}
    </div>
  );
}
