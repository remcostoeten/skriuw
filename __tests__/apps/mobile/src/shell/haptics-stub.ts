/** Stands in for `expo-haptics` in the mobile suite. */
export enum ImpactFeedbackStyle {
  Light = "light",
  Medium = "medium",
  Heavy = "heavy",
  Soft = "soft",
  Rigid = "rigid",
}

export enum NotificationFeedbackType {
  Success = "success",
  Warning = "warning",
  Error = "error",
}

export enum AndroidHaptics {
  Context_Click = "context-click",
  Long_Press = "long-press",
}

export async function impactAsync(): Promise<void> {}

export async function notificationAsync(): Promise<void> {}

export async function selectionAsync(): Promise<void> {}

export async function performAndroidHapticsAsync(): Promise<void> {}
