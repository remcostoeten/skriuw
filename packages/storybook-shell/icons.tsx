import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </Icon>
  );
}

export function ChevronDownIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m4 6 4 4 4-4" />
    </Icon>
  );
}

export function ChevronRightIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m6 4 4 4-4 4" />
    </Icon>
  );
}

export function SidebarIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </Icon>
  );
}

export function SunIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </Icon>
  );
}

export function MoonIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" />
    </Icon>
  );
}

export function MonitorIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11v3" />
    </Icon>
  );
}
