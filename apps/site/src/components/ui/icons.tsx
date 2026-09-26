import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function ArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h13" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

type PlusMinusProps = IconProps & { open?: boolean };

export function PlusMinus({ open, ...props }: PlusMinusProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 5v14"
        style={{
          transformBox: "view-box",
          transformOrigin: "12px 12px",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 200ms var(--ease-out)",
        }}
      />
      <path d="M5 12h14" />
    </svg>
  );
}

export function Check(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m5.6 5.6 12.8 12.8" />
      <path d="m18.4 5.6-12.8 12.8" />
    </svg>
  );
}

export function ListTodo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7.5 9.5h9" />
      <path d="M7.5 14h6" />
    </svg>
  );
}

export function CalendarRange(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function Shield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 4.5 6v6c0 4.4 3.1 7.7 7.5 9 4.4-1.3 7.5-4.6 7.5-9V6Z" />
    </svg>
  );
}

export function Plug(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3v6" />
      <path d="M15 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0Z" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function Users(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.7-3.1 2.9-4.7 5.5-4.7s4.8 1.6 5.5 4.7" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6" />
      <path d="M17.6 14.9c2.1.4 3.4 1.9 3.9 4.6" />
    </svg>
  );
}

export function Code(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m8.5 8-4.5 4 4.5 4" />
      <path d="m15.5 8 4.5 4-4.5 4" />
    </svg>
  );
}

export function Gauge(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12 15.5 8.5" />
    </svg>
  );
}

export function Bolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 3 5 13.5h6L11 21l8-10.5h-6Z" />
    </svg>
  );
}

export function Activity(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h4l2.5-7 5 14L17 12h4" />
    </svg>
  );
}

export function Search(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function Google(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z"
      />
    </svg>
  );
}

export function SlackMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M5.4 15.2a2.1 2.1 0 1 1-2.1-2.1h2.1v2.1Zm1.1 0a2.1 2.1 0 0 1 4.2 0v5.3a2.1 2.1 0 0 1-4.2 0v-5.3Z" />
      <path d="M8.6 5.4a2.1 2.1 0 1 1 2.1-2.1v2.1H8.6Zm0 1.1a2.1 2.1 0 0 1 0 4.2H3.3a2.1 2.1 0 0 1 0-4.2h5.3Z" />
      <path d="M18.6 8.6a2.1 2.1 0 1 1 2.1 2.1h-2.1V8.6Zm-1.1 0a2.1 2.1 0 0 1-4.2 0V3.3a2.1 2.1 0 0 1 4.2 0v5.3Z" />
      <path d="M15.4 18.6a2.1 2.1 0 1 1-2.1 2.1v-2.1h2.1Zm0-1.1a2.1 2.1 0 0 1 0-4.2h5.3a2.1 2.1 0 0 1 0 4.2h-5.3Z" />
    </svg>
  );
}

export function FigmaMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 4H9.35a2.65 2.65 0 1 0 0 5.3H12V4Z" />
      <path d="M12 4h2.65a2.65 2.65 0 0 1 0 5.3H12V4Z" />
      <path d="M12 9.3H9.35a2.65 2.65 0 1 0 0 5.3H12V9.3Z" />
      <path d="M14.65 9.3a2.65 2.65 0 1 0 0 5.3 2.65 2.65 0 0 0 0-5.3Z" />
      <path d="M9.35 14.6a2.65 2.65 0 1 0 0 5.3 2.65 2.65 0 0 0 0-5.3Z" />
    </svg>
  );
}

export function XSocial(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5 21H1.9l7.3-8.3L2.4 3h6.4l4.4 5.8L17.5 3Zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3Z" />
    </svg>
  );
}

export function GithubSocial(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export function LinkedinSocial(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.84-2.05 3.78-2.05 4.04 0 4.79 2.66 4.79 6.12V21h-4v-5.5c0-1.31-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9Z" />
    </svg>
  );
}

export function YoutubeSocial(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1-5.2 3.1Z" />
    </svg>
  );
}

export function Pen(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20c1.8-.4 3.2-1.3 4.4-2.6L18.6 6.4a2 2 0 0 0-2.9-2.8L5.5 14.8C4.3 16 3.6 17.5 3.2 19.2Z" />
      <path d="m14.4 5.2 3.3 3.2" />
    </svg>
  );
}

export function Link(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}

export function History(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.3l3 1.8" />
    </svg>
  );
}

export function Lock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function Command(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 9V6a2.5 2.5 0 1 0-2.5 2.5H18a2.5 2.5 0 1 0-2.5-2.5v12A2.5 2.5 0 1 0 18 15.5H6a2.5 2.5 0 1 0 2.5 2.5V9" />
    </svg>
  );
}

export function Download(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}

export function Globe(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z" />
    </svg>
  );
}

export function Apple(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.3 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.8 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.9-1.2 1.2-2.4 1.2-2.5 0 0-2.2-.9-2.2-3.6ZM14.1 5.9c.6-.7 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.6-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2Z" />
    </svg>
  );
}

export function Windows(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M3 5.6 10.4 4.6v7.1H3V5.6Zm8.6-1.2L21 3v8.7h-9.4V4.4ZM3 12.9h7.4V20L3 18.9v-6ZM11.6 12.9H21V21l-9.4-1.3v-6.8Z" />
    </svg>
  );
}

export function Linux(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2c-2.4 0-3.8 1.9-3.7 4.5.1 1.6-.1 2.5-.8 3.6-1.3 2-2.4 3.6-2.4 5.4 0 .9.3 1.4.8 1.7-.3.8.1 1.6 1 2 1.2.5 3 .6 4.4.6h1.4c1.4 0 3.2-.1 4.4-.6.9-.4 1.3-1.2 1-2 .5-.3.8-.8.8-1.7 0-1.8-1.1-3.4-2.4-5.4-.7-1.1-.9-2-.8-3.6C15.8 3.9 14.4 2 12 2Zm-1.6 3.4c.5 0 .9.5.9 1.2s-.4 1.2-.9 1.2-.9-.5-.9-1.2.4-1.2.9-1.2Zm3.2 0c.5 0 .9.5.9 1.2s-.4 1.2-.9 1.2-.9-.5-.9-1.2.4-1.2.9-1.2ZM12 8.6c1 0 2.3.6 2.3 1.1 0 .4-1.3 1.3-2.3 1.3s-2.3-.9-2.3-1.3c0-.5 1.3-1.1 2.3-1.1Z" />
    </svg>
  );
}

export function Android(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 15.5a6.5 6.5 0 0 1 13 0v.5h-13v-.5Z" />
      <path d="m7.5 9.5-1.5-2.5M16.5 9.5 18 7" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01" strokeWidth={2.2} />
      <path d="M3.5 15.5v3M20.5 15.5v3M9 18.5v2M15 18.5v2" />
    </svg>
  );
}

export function Pwa(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 8.5h18" />
      <path d="M12 11v6" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
    </svg>
  );
}

export function Terminal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7.5 10 2.5 2.2-2.5 2.2" />
      <path d="M12.5 14.8h4" />
    </svg>
  );
}

export function Sun(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function Moon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </svg>
  );
}

export function Monitor(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}
