import { AppLayout } from "@/layout/layout";
import { SettingsPanel } from "@/shared/ui/settings";
import { useSettings } from "@/shared/data/settings";

export default function SettingsPage() {
  const { settings, updateMultipleSettings, resetToDefaults, exportSettings, importSettings } = useSettings();

  const handleSettingChange = (key: string, value: any) => {
    updateMultipleSettings({ [key]: value });
  };

  const handleReset = () => {
    resetToDefaults();
  };

  const handleExport = () => {
    const settingsJson = exportSettings();
    const blob = new Blob([settingsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skriuw-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (settingsJson: string) => {
    importSettings(settingsJson);
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8">
        <SettingsPanel
          settings={settings}
          onChange={handleSettingChange}
          onReset={handleReset}
          onExport={handleExport}
          onImport={handleImport}
        />
      </div>
    </AppLayout>
  );
}