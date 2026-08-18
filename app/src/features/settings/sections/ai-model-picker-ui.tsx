import { cn } from "@/shared/lib/utils";
import type { AiModelOption, AiProviderGroup } from "@/features/ai/model-options";
import { anyAiModelAvailable, describeAiSelection } from "@/features/ai/model-options";
import { sameAiModel, type AiModelSelection } from "@/features/ai/model-selection";
import { settingsGroup, settingsGroupHint, settingsGroupTitle } from "./settings-shared";

type PickerProps = {
  groups: readonly AiProviderGroup[];
  selection: AiModelSelection | null;
  onSelect: (selection: AiModelSelection) => void;
};

export function DefaultModelPicker({ groups, selection, onSelect }: PickerProps) {
  const nothingAvailable = !anyAiModelAvailable(groups);
  return (
    <div className={settingsGroup}>
      <h2 className={settingsGroupTitle}>Default model</h2>
      <p className={settingsGroupHint}>
        {nothingAvailable
          ? "Install Ollama or add a provider key below, then pick the model AI features use."
          : describeAiSelection(groups, selection)}
      </p>
      <div
        role="radiogroup"
        aria-label="Default AI model"
        className="overflow-hidden rounded-lg border border-border/60"
      >
        {groups.map((group) => (
          <ProviderRows
            key={group.providerId}
            group={group}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

type ProviderRowsProps = {
  group: AiProviderGroup;
  selection: AiModelSelection | null;
  onSelect: (selection: AiModelSelection) => void;
};

function ProviderRows({ group, selection, onSelect }: ProviderRowsProps) {
  return (
    <div>
      <div className="border-b border-border/40 bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {group.label}
      </div>
      {group.options.map((option) => (
        <ModelOptionRow
          key={`${option.providerId}:${option.modelId}`}
          option={option}
          selected={sameAiModel(selection, {
            providerId: option.providerId,
            modelId: option.modelId,
          })}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type RowProps = {
  option: AiModelOption;
  selected: boolean;
  onSelect: (selection: AiModelSelection) => void;
};

function ModelOptionRow({ option, selected, onSelect }: RowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!option.available}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/30 px-3 py-2 text-left last:border-b-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        option.available
          ? "cursor-pointer hover:bg-accent/30"
          : "cursor-default opacity-60",
      )}
      onClick={() => {
        if (option.available) {
          onSelect({ providerId: option.providerId, modelId: option.modelId });
        }
      }}
    >
      <span
        className={cn(
          "h-2 w-2 flex-none rounded-full border",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground/50",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{option.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {option.available
            ? (option.detail ?? option.modelId)
            : (option.disabledReason ?? "Unavailable")}
        </span>
      </span>
      {option.available && option.detail !== null && (
        <span className="flex-none font-mono text-[10px] text-muted-foreground/70">
          {option.modelId}
        </span>
      )}
    </button>
  );
}
