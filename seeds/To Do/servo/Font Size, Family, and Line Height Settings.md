# Font Size, Family, and Line Height Settings Implementation Plan

## Overview

Implement user-configurable font settings (size, family, and line height) throughout the application. These settings should be accessible via the settings panel and apply consistently across all editors and viewing modes.

## Goals

- Provide configurable font size, family, and line height settings
- Apply settings consistently across BlockNote editor, RawMDXEditor, and note viewer
- Support multiple font families (sans-serif, serif, monospace)
- Allow granular control with sensible defaults
- Persist user preferences
- Provide live preview of font changes

## Current State

### Existing Implementation

- `DualModeEditor` accepts `fontSize`, `fontFamily`, and `lineHeight` as props (defaults: 16px, Inter, 1.6)
- `RawMDXEditor` accepts the same props
- `useEditorConfig` has hardcoded values: `fontSize = 'medium'`, `fontFamily = 'inter'`, `lineHeight = 1.6`
- Font mapping functions exist in `useEditorConfig.ts`:
  - `getFontSizePx()` - maps size strings to pixel values
  - `getFontFamily()` - maps family strings to CSS font stacks

### Issues to Address

- Settings are not user-configurable
- Hardcoded values in multiple places
- No settings UI for font preferences
- Settings not persisted or loaded from storage
- Inconsistent application across components

## Architecture

### 1. Settings Storage

#### Extend Settings Schema

```typescript
// src/features/settings/types.ts
interface FontSettings {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' | string // Allow custom px values
  fontFamily: 'inter' | 'mono' | 'serif' | 'sans-serif' | string
  lineHeight: number // 1.0 to 2.5, step 0.1
}
```

#### Default Values

```typescript
const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontSize: 'medium',      // Maps to 16px
  fontFamily: 'inter',      // Maps to Inter font stack
  lineHeight: 1.6          // 1.6x line height
}
```

### 2. Settings Provider Integration

#### Update SettingsProvider

- Add font settings to `DEFAULT_SETTINGS`
- Load font settings from storage
- Provide font settings via context/hooks
- Save font settings on change

### 3. Settings UI Components

#### Font Settings Panel

```
src/features/settings/components/FontSettings/
├── FontSettings.tsx           # Main font settings panel
├── FontSizeSelector.tsx       # Font size picker
├── FontFamilySelector.tsx     # Font family picker
├── LineHeightSlider.tsx       # Line height slider
└── FontPreview.tsx            # Live preview component
```

#### UI Design

```
┌─────────────────────────────────────────┐
│ Typography Settings                     │
├─────────────────────────────────────────┤
│                                         │
│ Font Size                               │
│ ○ Small (14px)                          │
│ ● Medium (16px)                         │
│ ○ Large (18px)                          │
│ ○ Extra Large (20px)                    │
│ ○ Custom: [____] px                     │
│                                         │
│ Font Family                             │
│ ● Inter (Sans-serif)                    │
│ ○ Mono (Monospace)                      │
│ ○ Serif                                 │
│ ○ System Sans-serif                     │
│                                         │
│ Line Height                             │
│ [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]   │
│ 1.0 ───────────────────────────── 2.5   │
│ Current: 1.6                            │
│                                         │
│ Preview                                 │
│ ┌─────────────────────────────────────┐ │
│ │ The quick brown fox jumps over the  │ │
│ │ lazy dog. This is a preview of how  │ │
│ │ your text will look with the        │ │
│ │ selected font settings.              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Reset to Defaults]                     │
└─────────────────────────────────────────┘
```

### 4. Editor Integration

#### Update useEditorConfig Hook

```typescript
// src/features/editor/hooks/useEditorConfig.ts
export function useEditorConfig() {
  const { fontSize, fontFamily, lineHeight } = useFontSettings()
  
  // Use settings instead of hardcoded values
  const editorConfig = useMemo(() => {
    return {
      editorProps: {
        attributes: {
          style: {
            fontSize: getFontSizePx(fontSize),
            fontFamily: getFontFamily(fontFamily),
            lineHeight: lineHeight.toString(),
            // ... other styles
          }
        }
      }
    }
  }, [fontSize, fontFamily, lineHeight])
}
```

#### Create useFontSettings Hook

```typescript
// src/features/settings/hooks/use-font-settings.ts
export function useFontSettings() {
  const { settings, updateSetting } = useSettings()
  
  return {
    fontSize: settings.fontSize ?? DEFAULT_FONT_SETTINGS.fontSize,
    fontFamily: settings.fontFamily ?? DEFAULT_FONT_SETTINGS.fontFamily,
    lineHeight: settings.lineHeight ?? DEFAULT_FONT_SETTINGS.lineHeight,
    updateFontSize: (size: string) => updateSetting('fontSize', size),
    updateFontFamily: (family: string) => updateSetting('fontFamily', family),
    updateLineHeight: (height: number) => updateSetting('lineHeight', height),
    resetToDefaults: () => {
      updateSetting('fontSize', DEFAULT_FONT_SETTINGS.fontSize)
      updateSetting('fontFamily', DEFAULT_FONT_SETTINGS.fontFamily)
      updateSetting('lineHeight', DEFAULT_FONT_SETTINGS.lineHeight)
    }
  }
}
```

#### Update Editor Components

- `DualModeEditor`: Use settings from hook instead of props
- `RawMDXEditor`: Use settings from hook
- `NoteViewer`: Apply font settings to rendered content
- `EditorWrapper`: Pass settings down to child components

### 5. Font Size Options

#### Preset Sizes

```typescript
const FONT_SIZE_PRESETS = {
  small: '14px',
  medium: '16px',
  large: '18px',
  xlarge: '20px',
  xxlarge: '24px'
} as const
```

#### Custom Size Support

- Allow users to enter custom pixel values (e.g., "15px", "17px")
- Validate input (min: 10px, max: 32px)
- Store as string to support both presets and custom values

### 6. Font Family Options

#### Available Families

```typescript
const FONT_FAMILIES = {
  inter: {
    name: 'Inter',
    description: 'Modern sans-serif',
    stack: '"Inter", system-ui, sans-serif'
  },
  mono: {
    name: 'Monospace',
    description: 'Code-friendly monospace',
    stack: '"Fira Code", "Menlo", "Monaco", monospace'
  },
  serif: {
    name: 'Serif',
    description: 'Traditional serif',
    stack: '"Georgia", "Times New Roman", serif'
  },
  'sans-serif': {
    name: 'System Sans-serif',
    description: 'System default',
    stack: 'system-ui, sans-serif'
  }
} as const
```

### 7. Line Height Options

#### Range and Step

- Minimum: 1.0 (tight)
- Maximum: 2.5 (very loose)
- Step: 0.1
- Default: 1.6 (comfortable reading)

#### Preset Options

- Tight: 1.2
- Normal: 1.5
- Comfortable: 1.6
- Loose: 1.8
- Very Loose: 2.0

## Implementation Phases

### Phase 1: Settings Infrastructure (Week 1)

- [ ] Extend settings schema with font settings
- [ ] Update `SettingsProvider` to include font defaults
- [ ] Create `useFontSettings` hook
- [ ] Update settings storage to persist font preferences
- [ ] Add font settings to settings context

### Phase 2: Settings UI (Week 2)

- [ ] Create `FontSettings` component
- [ ] Implement `FontSizeSelector` with presets and custom input
- [ ] Implement `FontFamilySelector` with visual previews
- [ ] Implement `LineHeightSlider` with presets
- [ ] Create `FontPreview` component for live preview
- [ ] Add font settings to main settings panel
- [ ] Implement reset to defaults functionality

### Phase 3: Editor Integration (Week 3)

- [ ] Update `useEditorConfig` to use font settings
- [ ] Update `DualModeEditor` to use settings hook
- [ ] Update `RawMDXEditor` to use settings hook
- [ ] Update `NoteViewer` to apply font settings
- [ ] Ensure settings apply to both BlockNote and MDX modes
- [ ] Test settings persistence across sessions

### Phase 4: Advanced Features (Week 4)

- [ ] Add per-note font settings (optional, future enhancement)
- [ ] Implement font loading optimization
- [ ] Add font size keyboard shortcuts (Ctrl/Cmd + +/-)
- [ ] Add accessibility considerations (minimum readable size)
- [ ] Performance optimization for font changes

### Phase 5: Testing & Polish (Week 5)

- [ ] Test all font combinations
- [ ] Verify settings persistence
- [ ] Test in all editor modes (rich, MDX, side-by-side)
- [ ] Accessibility testing
- [ ] Performance testing
- [ ] User feedback and iteration

## Technical Details

### Font Size Conversion

```typescript
function getFontSizePx(size: string | number): string {
  // If already in px format, return as-is
  if (typeof size === 'string' && size.endsWith('px')) {
    const pxValue = parseInt(size, 10)
    return pxValue >= 10 && pxValue <= 32 ? size : '16px'
  }
  
  // Map preset names to pixel values
  const sizeMap: Record<string, string> = {
    small: '14px',
    medium: '16px',
    large: '18px',
    xlarge: '20px',
    xxlarge: '24px'
  }
  
  return sizeMap[size] || '16px'
}
```

### Font Family Mapping

```typescript
function getFontFamily(family: string): string {
  const fontMap: Record<string, string> = {
    inter: '"Inter", system-ui, sans-serif',
    mono: '"Fira Code", "Menlo", "Monaco", monospace',
    serif: '"Georgia", "Times New Roman", serif',
    'sans-serif': 'system-ui, sans-serif'
  }
  
  return fontMap[family] || fontMap.inter
}
```

### Settings Persistence

- Store in same location as other settings (localStorage/indexedDB)
- Save immediately on change (no debounce needed for font settings)
- Load on app initialization
- Provide migration path if settings schema changes

## Component Updates

### DualModeEditor

```typescript
export function DualModeEditor({ editor, value, onChange, ...props }: DualModeEditorProps) {
  const { fontSize, fontFamily, lineHeight } = useFontSettings()
  
  // Use settings instead of props
  return (
    // ... render with font settings
  )
}
```

### RawMDXEditor

```typescript
export function RawMDXEditor({ value, onChange, ...props }: RawMDXEditorProps) {
  const { fontSize, fontFamily, lineHeight } = useFontSettings()
  
  return (
    <textarea
      style={{
        fontSize: getFontSizePx(fontSize),
        fontFamily: getFontFamily(fontFamily),
        lineHeight: lineHeight.toString(),
        // ... other styles
      }}
    />
  )
}
```

## Testing Strategy

### Unit Tests

- Font size conversion functions
- Font family mapping
- Settings hook functionality
- Settings persistence

### Integration Tests

- Settings UI components
- Editor font application
- Settings persistence across sessions
- Settings reset functionality

### E2E Tests

- Change font settings and verify in editor
- Verify settings persist after page reload
- Test all font combinations
- Test custom font sizes

## Accessibility Considerations

- Ensure minimum font size of 10px for readability
- Provide high contrast options
- Support system font size preferences
- Test with screen readers
- Ensure line height doesn't break layout

## Performance Considerations

- Cache font family CSS
- Minimize re-renders when settings change
- Lazy load font files if using web fonts
- Optimize settings storage operations

## Future Enhancements

- Per-note font settings
- Custom font upload
- Font weight and style options
- Font size keyboard shortcuts
- Font size zoom (temporary vs persistent)
- Font pairing suggestions
- Reading mode with optimized typography

## Migration Notes

- Existing users will get default font settings on first load
- No data migration needed (settings are additive)
- Consider showing a "New: Font Settings" notification

## Resources

- Typography best practices
- Web font loading optimization
- CSS font-family fallback strategies
- Line height and readability research
