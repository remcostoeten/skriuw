import type { AiProviderGroup } from "@/features/ai/model-options";
import { aiModelOptionFor } from "@/features/ai/model-options";
import type { AiModelSelection } from "@/features/ai/model-selection";
import { cn } from "@/shared/lib/utils";
import { Select, type SelectOption } from "@/shared/ui/select";
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
  const selectOptions: SelectOption<string>[] = availableGroups.flatMap((group) =>
    group.options.map((option) => ({
      value: modelOptionValue(option.providerId, option.modelId),
      label: option.label,
      detail: option.detail,
      group: group.label,
    })),
  );

  return (
    <div className={settingsGroup}>
      <h2 className={settingsGroupTitle}>Default model</h2>
      <p className={settingsGroupHint}>The model Skriuw uses for writing tools.</p>
      <Select
        label="Default AI model"
        align="start"
        className="w-full"
        triggerClassName={cn(settingsTextInput, "w-full justify-between text-left")}
        disabled={availableOptions.length === 0}
        placeholder={availableOptions.length === 0 ? "Set up a model below" : "Choose a model"}
        value={selectedValue}
        options={selectOptions}
        onChange={(value) => {
          const option = availableOptions.find(
            (candidate) => modelOptionValue(candidate.providerId, candidate.modelId) === value,
          );
          if (option) {
            onSelect({ providerId: option.providerId, modelId: option.modelId });
          }
        }}
      />
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
