import {
  FileText,
  Command,
  LayoutTemplate,
  Link2,
  Search,
  Keyboard,
  FileDown,
  Copy,
  Image,
  File,
  Link,
  Code,
  Table,
  HardDrive,
  WifiOff,
  Lock,
  Pen
} from 'lucide-react'
import type { IconMap } from '../types/integrations'

export const chipIcons: IconMap = {
  Markdown: FileText,
  'Slash Commands': Command,
  Templates: LayoutTemplate,
  Backlinks: Link2,
  'Global Search': Search,
  'Keyboard Shortcuts': Keyboard,
  'PDF Export': FileDown,
  'Markdown Export': FileText,
  'Copy to Clipboard': Copy,
  Images: Image,
  Files: File,
  Links: Link,
  'Code Blocks': Code,
  Tables: Table,
  'Local First': HardDrive,
  'Offline Mode': WifiOff,
  'Encrypted Vault': Lock
}

export function getChipIcon(label: string) {
  return chipIcons[label] ?? Pen
}
