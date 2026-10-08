import { settingsCopy } from "@/shared/ui/settings-copy";
import type { AiModelSelection, AiProviderGroup } from "@/features/ai/models";
import { aiModelOptionFor } from "@/features/ai/models";
import { cn } from "@/shared/styling/class-names";
import { Select, type SelectOption } from "@/shared/ui/select";
import {
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsTextInput,
} from "@/shared/ui/settings-controls";

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
      <p className={settingsGroupHint}>{settingsCopy.ai.theModelSkriuwUsesForWriting}</p>
      <Select
        label={settingsCopy.ai.defaultAiModel}
        align="start"
        className="w-full"
        triggerClassName={cn(settingsTextInput, "w-full justify-between text-left")}
        disabled={availableOptions.length === 0}
        placeholder={
          availableOptions.length === 0
            ? settingsCopy.ai.setUpAModelBelow
            : settingsCopy.ai.chooseAModel
        }
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
            ? settingsCopy.ai.openLocalAiOrOnlineProviders
            : settingsCopy.ai.chooseTheModelYouWantTo)}
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
