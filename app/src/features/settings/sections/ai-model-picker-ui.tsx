import type { AiProviderGroup } from "@/features/ai/model-options";
import { aiModelOptionFor } from "@/features/ai/model-options";
import type { AiModelSelection } from "@/features/ai/model-selection";
import { cn } from "@/shared/lib/utils";
import {
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsTextInput,
} from "./settings-shared";

type Props = {
  groups: readonly AiProviderGroup[];
  selection: AiModelSelection | null;
  onSelect: (selection: AiModelSelection) => void;
};

export function DefaultModelPicker({ groups, selection, onSelect }: Props) {
  const availableGroups = groupsWithAvailableModels(groups);
  const availableOptions = availableGroups.flatMap((group) => group.options);
  const matchedOption = aiModelOptionFor(groups, selection);
  const selectedOption = matchedOption?.available ? matchedOption : null;
  const selectedValue = selectedOption
    ? modelOptionValue(selectedOption.providerId, selectedOption.modelId)
    : "";

  return (
    <div className={settingsGroup}>
      <h2 className={settingsGroupTitle}>Default model</h2>
      <p className={settingsGroupHint}>The model Skriuw uses for writing tools.</p>
      <select
        aria-label="Default AI model"
        className={cn(settingsTextInput, "w-full cursor-pointer")}
        disabled={availableOptions.length === 0}
        value={selectedValue}
        onChange={(event) => {
          const option = availableOptions.find(
            (candidate) =>
              modelOptionValue(candidate.providerId, candidate.modelId) === event.target.value,
          );
          if (option) {
            onSelect({ providerId: option.providerId, modelId: option.modelId });
          }
        }}
      >
        {selectedOption === null ? (
          <option value="">
            {availableOptions.length === 0 ? "Set up a model below" : "Choose a model"}
          </option>
        ) : null}
        {availableGroups.map((group) => (
          <optgroup key={group.providerId} label={group.label}>
            {group.options.map((option) => (
              <option
                key={modelOptionValue(option.providerId, option.modelId)}
                value={modelOptionValue(option.providerId, option.modelId)}
              >
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {selectedOption?.detail ??
          (availableOptions.length === 0
            ? "Open Local AI or Online providers to get started."
            : "Choose the model you want to use.")}
      </p>
    </div>
  );
}

function modelOptionValue(providerId: string, modelId: string): string {
  return JSON.stringify([providerId, modelId]);
}

function groupsWithAvailableModels(groups: readonly AiProviderGroup[]): AiProviderGroup[] {
  const availableGroups: AiProviderGroup[] = [];
  for (const group of groups) {
    const options = group.options.filter((option) => option.available);
    if (options.length > 0) {
      availableGroups.push({ ...group, options });
    }
  }
  return availableGroups;
}
