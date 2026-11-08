import { settingsCopy } from "@/shared/ui/settings-copy";
import type { AiModelSelection, AiProviderGroup } from "@/features/ai/models";
import { aiModelOptionFor } from "@/features/ai/models";
import { cn } from "@/shared/styling/class-names";
import { Select, type SelectOption } from "@/shared/ui/select";
import { SettingsRow, settingsTextInput } from "@/shared/ui/settings-controls";

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
    <SettingsRow
      label={settingsCopy.ai.defaultAiModel}
      detail={settingsCopy.ai.theModelSkriuwUsesForWriting}
      notes={
        <span className="text-[11px] font-normal text-theme-dim">
          {selectedOption?.detail ??
            (availableOptions.length === 0
              ? settingsCopy.ai.openLocalAiOrOnlineProviders
              : settingsCopy.ai.chooseTheModelYouWantTo)}
        </span>
      }
    >
      <Select
        label={settingsCopy.ai.defaultAiModel}
        align="end"
        className="w-[min(240px,48%)] max-[620px]:w-full"
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
    </SettingsRow>
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
