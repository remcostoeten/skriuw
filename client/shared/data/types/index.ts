
// User settings interfaces
export interface UserSetting<T = any> {
  key: string;
  value: T;
  defaultValue: T;
  type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
  description: string;
  category: SettingsCategory;
  requiresRestart?: boolean;
  options?: T[]; // For enum type settings
  validation?: (value: T) => boolean | string;
}

export type SettingsCategory =
  | 'editor'
  | 'appearance'
  | 'behavior'
  | 'shortcuts'
  | 'backup'
  | 'advanced';

export interface SettingsGroup {
  category: SettingsCategory;
  title: string;
  description: string;
  settings: UserSetting[];
}

export interface SettingsConfig {
  key: string;
  defaultValue: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
  description: string;
  category: SettingsCategory;
  requiresRestart?: boolean;
  options?: any[];
  validation?: (value: any) => boolean | string;
}
