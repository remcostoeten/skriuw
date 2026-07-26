import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const ICON_STROKE_PX = 0.8;
const ICON_VIEWBOX = 24;

/**
 * Stroke width is expressed in viewBox units, so a fixed number renders heavier
 * on large icons and fainter on small ones. Scaling by the render size keeps
 * every icon at `ICON_STROKE_PX` on screen.
 */
export function iconStrokeWidth(size: number, weightPx = ICON_STROKE_PX): number {
  return (ICON_VIEWBOX / size) * weightPx;
}

function LucideIcon({ size = 16, strokeWidth, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? iconStrokeWidth(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ZoomInIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </LucideIcon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </LucideIcon>
  );
}

export function PinOffIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </LucideIcon>
  );
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6" />
    </LucideIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </LucideIcon>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M5 12h14" />
    </LucideIcon>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </LucideIcon>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </LucideIcon>
  );
}

export function RotateCcwIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </LucideIcon>
  );
}

export function Undo2Icon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </LucideIcon>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M6 8h.001" />
      <path d="M10 8h.001" />
      <path d="M14 8h.001" />
      <path d="M18 8h.001" />
      <path d="M8 12h.001" />
      <path d="M12 12h.001" />
      <path d="M16 12h.001" />
      <path d="M7 16h10" />
    </LucideIcon>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </LucideIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </LucideIcon>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </LucideIcon>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </LucideIcon>
  );
}

export function ListTodoIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </LucideIcon>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
      <circle cx="12" cy="12" r="10" />
    </LucideIcon>
  );
}

export function Trash2Icon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </LucideIcon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </LucideIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </LucideIcon>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </LucideIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </LucideIcon>
  );
}

export function UnfoldVerticalIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 22v-6" />
      <path d="M12 8V2" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="m15 19-3 3-3-3" />
      <path d="m15 5-3-3-3 3" />
    </LucideIcon>
  );
}

export function FoldVerticalIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 22v-6" />
      <path d="M12 8V2" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="m15 19-3-3-3 3" />
      <path d="m15 5-3 3-3-3" />
    </LucideIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </LucideIcon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </LucideIcon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </LucideIcon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </LucideIcon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </LucideIcon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </LucideIcon>
  );
}

export function FilePlusIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M9 15h6" />
      <path d="M12 18v-6" />
    </LucideIcon>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </LucideIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </LucideIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </LucideIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </LucideIcon>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="12" r="10" />
    </LucideIcon>
  );
}

export function MoreHorizontalIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </LucideIcon>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </LucideIcon>
  );
}

export function FolderInputIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" />
      <path d="M2 13h10" />
      <path d="m9 16 3-3-3-3" />
    </LucideIcon>
  );
}

export function SkriuwLogo({ size = 26, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      {...props}
    >
      <rect x="4" y="8" width="8" height="24" rx="1" />
      <rect x="16" y="4" width="8" height="32" rx="1" />
      <rect x="28" y="12" width="8" height="16" rx="1" />
    </svg>
  );
}

export function NewNoteIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 10.25C10.4142 10.25 10.75 9.91421 10.75 9.5L10.75 8.25L12 8.25C12.4142 8.25 12.75 7.91421 12.75 7.5C12.75 7.08579 12.4142 6.75 12 6.75L10.75 6.75L10.75 5.5C10.75 5.08579 10.4142 4.75 10 4.75C9.58579 4.75 9.25 5.08579 9.25 5.5L9.25 6.75L8 6.75C7.58579 6.75 7.25 7.08579 7.25 7.5C7.25 7.91421 7.58579 8.25 8 8.25L9.25 8.25L9.25 9.5C9.25 9.91421 9.58579 10.25 10 10.25Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.43 19.9999C11.0553 20.0005 11.5687 20.0011 12.0425 19.801C12.4079 19.6468 12.7072 19.3912 13.0276 19.0754L16.803 15.2303C16.8581 15.1743 16.9119 15.1195 16.9644 15.0656C17.0081 15.0208 17.0518 14.9756 17.0943 14.9306C17.4037 14.6043 17.6539 14.2997 17.805 13.9281C18.001 13.4457 18.0005 12.923 17.9999 12.2854L17.9999 8.09515C17.9999 6.40174 17.9999 5.05339 17.8605 3.99652C17.7166 2.90602 17.4121 2.01239 16.719 1.30596C16.0257 0.59936 15.1485 0.288792 14.0779 0.142102C13.0408 -0.00002 11.7177 -0.00001 10.0564 0L9.94344 0C8.28219 -0.00001 6.95908 -0.00002 5.92191 0.142103C4.85139 0.288793 3.97413 0.599361 3.28085 1.30596C2.58774 2.01239 2.28324 2.90602 2.13939 3.99652C1.99997 5.05342 1.99999 6.40178 2 8.09523L2 11.9046C1.99999 13.5981 1.99998 14.9464 2.13939 16.0033C2.28324 17.0938 2.58774 17.9875 3.28085 18.6939C3.97413 19.4005 4.8514 19.7111 5.92191 19.8578C6.95912 19.9999 8.28226 19.9999 9.94358 19.9999L10.43 19.9999ZM11.0734 18.4633C11.0633 18.2993 11.0634 18.1178 11.0635 17.9433L11.0635 17.3374C11.0634 16.5111 11.0634 15.8153 11.1365 15.2613C11.214 14.6739 11.3857 14.1333 11.8134 13.6974C12.2412 13.2614 12.7721 13.0861 13.349 13.0071C13.8928 12.9326 14.5757 12.9326 15.3862 12.9326L15.9811 12.9326C16.1516 12.9325 16.3292 12.9325 16.4899 12.9427C16.4991 12.7707 16.5015 12.529 16.5015 12.1644L16.5015 8.15241C16.5015 6.389 16.5 5.14306 16.3755 4.19937C16.2539 3.27751 16.0275 2.75905 15.6587 2.38321C15.2901 2.00753 14.7819 1.77699 13.878 1.65313C12.9524 1.52629 11.7302 1.52466 9.99993 1.52467C8.26966 1.52467 7.04749 1.52629 6.12187 1.65313C5.21796 1.77699 4.70976 2.00753 4.34116 2.38321C3.9724 2.75906 3.74598 3.27751 3.62438 4.19937C3.49989 5.14306 3.49831 6.389 3.49831 8.15241L3.49831 11.8474C3.49831 13.6108 3.49989 14.8568 3.62438 15.8005C3.74598 16.7223 3.9724 17.2408 4.34116 17.6166C4.70976 17.9923 5.21796 18.2229 6.12187 18.3467C7.04749 18.4736 8.26966 18.4752 9.99993 18.4752L10.3109 18.4752C10.668 18.4752 10.9049 18.4727 11.0734 18.4633Z"
      />
    </svg>
  );
}

export function NewFolderIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 8.75C10.4142 8.75 10.75 9.08579 10.75 9.5V10.75H12C12.4142 10.75 12.75 11.0858 12.75 11.5C12.75 11.9142 12.4142 12.25 12 12.25H10.75V13.5C10.75 13.9142 10.4142 14.25 10 14.25C9.58579 14.25 9.25 13.9142 9.25 13.5V12.25H8C7.58579 12.25 7.25 11.9142 7.25 11.5C7.25 11.0858 7.58579 10.75 8 10.75H9.25V9.5C9.25 9.08579 9.58579 8.75 10 8.75Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.54356 1H5.37683C4.56054 0.999976 3.87093 0.999955 3.32143 1.07383C2.73783 1.1523 2.19785 1.32663 1.76224 1.76224C1.32663 2.19785 1.1523 2.73783 1.07383 3.32143C0.999955 3.87093 0.999976 4.56048 1 5.37677V12.7983C0.999985 14.0429 0.999971 15.0553 1.10729 15.8535C1.21922 16.686 1.46048 17.4006 2.02993 17.9701C2.59937 18.5395 3.31398 18.7808 4.14647 18.8927C4.94475 19 5.95705 19 7.20173 19H12.7983C14.043 19 15.0553 19 15.8535 18.8927C16.686 18.7808 17.4006 18.5395 17.9701 17.9701C18.5395 17.4006 18.7808 16.686 18.8927 15.8535C19 15.0553 19 14.043 19 12.7983V10.4005C19 9.15583 19 8.14353 18.8927 7.34525C18.7808 6.51276 18.5395 5.79815 17.9701 5.22871C17.4006 4.65926 16.686 4.418 15.8535 4.30607C15.0553 4.19875 14.043 4.19877 12.7983 4.19878L11.5177 4.19878C11.2437 4.19878 11.0942 4.19791 10.9851 4.18711C10.9515 4.18379 10.9306 4.18021 10.9187 4.17768C10.9106 4.1686 10.8972 4.15227 10.8776 4.1247C10.8141 4.03534 10.7392 3.90601 10.6032 3.66806L10.3364 3.20108C10.0947 2.77812 9.88601 2.41293 9.68211 2.12595C9.46334 1.81806 9.21648 1.54999 8.87457 1.35157C8.53266 1.15315 8.17743 1.07182 7.80157 1.03463C7.45127 0.999976 7.03064 0.999987 6.54356 1ZM3.52785 2.60914C3.96198 2.55078 4.54667 2.54913 5.43032 2.54913H6.50758C7.04035 2.54913 7.38395 2.55 7.64905 2.57623C7.89714 2.60078 8.01344 2.64291 8.09703 2.69142C8.18061 2.73993 8.2749 2.82 8.4193 3.02323C8.57359 3.24038 8.74483 3.53828 9.00915 4.00085L9.27319 4.46291C9.38879 4.66527 9.50151 4.86259 9.61476 5.02197C9.74274 5.20209 9.90431 5.38312 10.1398 5.51981C10.3754 5.6565 10.6127 5.70696 10.8326 5.72871C11.0272 5.74797 11.2553 5.74794 11.4884 5.74791L12.7418 5.74791C14.0563 5.74791 14.9641 5.74956 15.6471 5.84138C16.3078 5.93021 16.641 6.09045 16.8747 6.3241C17.1083 6.55776 17.2686 6.89098 17.3574 7.55167C17.4492 8.23468 17.4509 9.14252 17.4509 10.457V12.7418C17.4509 14.0563 17.4492 14.9641 17.3574 15.6471C17.2686 16.3078 17.1083 16.641 16.8747 16.8747C16.641 17.1083 16.3078 17.2686 15.6471 17.3574C14.9641 17.4492 14.0563 17.4509 12.7418 17.4509H7.25824C5.94374 17.4509 5.03591 17.4492 4.35289 17.3574C3.6922 17.2686 3.35898 17.1083 3.12533 16.8747C2.89167 16.641 2.73143 16.3078 2.64261 15.6471C2.55079 14.9641 2.54913 14.0563 2.54913 12.7418V5.43032C2.54913 4.54667 2.55078 3.96198 2.60914 3.52785C2.66489 3.11259 2.76393 2.91933 2.87828 2.79828C2.99251 2.67739 3.19102 2.5699 3.52785 2.60914Z"
      />
    </svg>
  );
}

export function PanelLeftToggleIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M9 4l0 16" />
    </LucideIcon>
  );
}

export function PanelRightToggleIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M15 4l0 16" />
    </LucideIcon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </LucideIcon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </LucideIcon>
  );
}

export function CaseSensitiveIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m3 15 4-8 4 8" />
      <path d="M4 13h6" />
      <circle cx="18" cy="12" r="3" />
      <path d="M21 9v6" />
    </LucideIcon>
  );
}

export function WholeWordIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="7" cy="12" r="3" />
      <path d="M10 9v6" />
      <circle cx="17" cy="12" r="3" />
      <path d="M14 7v8" />
      <path d="M22 17v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1" />
    </LucideIcon>
  );
}

export function RegexIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M17 3v10" />
      <path d="m12.67 5.5 8.66 5" />
      <path d="m12.67 10.5 8.66-5" />
      <path d="M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z" />
    </LucideIcon>
  );
}

export function ReplaceIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M14 4a2 2 0 0 1 2-2" />
      <path d="M16 10a2 2 0 0 1-2-2" />
      <path d="M20 2a2 2 0 0 1 2 2" />
      <path d="M22 8a2 2 0 0 1-2 2" />
      <path d="m3 7 3 3 3-3" />
      <path d="M6 10V5a3 3 0 0 1 3-3h1" />
      <rect x="2" y="14" width="8" height="8" rx="2" />
    </LucideIcon>
  );
}

export function ReplaceAllIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M14 4a2 2 0 0 1 2-2" />
      <path d="M16 10a2 2 0 0 1-2-2" />
      <path d="M20 2a2 2 0 0 1 2 2" />
      <path d="M22 8a2 2 0 0 1-2 2" />
      <path d="m3 7 3 3 3-3" />
      <path d="M6 10V5a3 3 0 0 1 3-3h1" />
      <rect x="2" y="14" width="8" height="8" rx="2" />
      <path d="M14 14a2 2 0 0 1 2-2" />
      <path d="M20 12a2 2 0 0 1 2 2" />
      <path d="M14 20a2 2 0 0 0 2 2" />
      <path d="M20 22a2 2 0 0 0 2-2" />
    </LucideIcon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </LucideIcon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </LucideIcon>
  );
}

export function WaypointsIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="m10.2 6.3-3.9 3.9" />
      <circle cx="4.5" cy="12" r="2.5" />
      <path d="M7 12h10" />
      <circle cx="19.5" cy="12" r="2.5" />
      <path d="m13.8 17.7 3.9-3.9" />
      <circle cx="12" cy="19.5" r="2.5" />
    </LucideIcon>
  );
}

export function BoldIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
    </LucideIcon>
  );
}

export function ItalicIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <line x1="19" x2="10" y1="4" y2="4" />
      <line x1="14" x2="5" y1="20" y2="20" />
      <line x1="15" x2="9" y1="4" y2="20" />
    </LucideIcon>
  );
}

export function StrikethroughIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" x2="20" y1="12" y2="12" />
    </LucideIcon>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </LucideIcon>
  );
}

export function TextQuoteIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M17 6H3" />
      <path d="M21 12H8" />
      <path d="M21 18H8" />
      <path d="M3 12v6" />
    </LucideIcon>
  );
}

export function TypeIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </LucideIcon>
  );
}

export function Heading1Icon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="m17 12 3-2v8" />
    </LucideIcon>
  );
}

export function Heading2Icon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
    </LucideIcon>
  );
}

export function Heading3Icon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
      <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
    </LucideIcon>
  );
}

export function ListOrderedIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M10 6h11" />
      <path d="M4 10h2" />
      <path d="M4 6h1v4" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </LucideIcon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M5 12h14" />
    </LucideIcon>
  );
}

export function SquareCodeIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m10 9-3 3 3 3" />
      <path d="m14 15 3-3-3-3" />
    </LucideIcon>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M12 3v18" />
    </LucideIcon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </LucideIcon>
  );
}

export function UnlinkIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" x2="8" y1="2" y2="5" />
      <line x1="2" x2="5" y1="8" y2="8" />
      <line x1="16" x2="16" y1="19" y2="22" />
      <line x1="19" x2="22" y1="16" y2="16" />
    </LucideIcon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </LucideIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </LucideIcon>
  );
}

export function HashIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </LucideIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </LucideIcon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </LucideIcon>
  );
}

export function SquareCheckIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </LucideIcon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </LucideIcon>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </LucideIcon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </LucideIcon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </LucideIcon>
  );
}

export function LayoutDashboardIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </LucideIcon>
  );
}
