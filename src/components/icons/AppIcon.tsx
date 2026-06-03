import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "home"
  | "users"
  | "message"
  | "target"
  | "settings"
  | "chevron-right"
  | "arrow-left"
  | "x"
  | "eye"
  | "eye-off"
  | "link"
  | "send"
  | "external-link"
  | "book"
  | "play";

type IconProps = SVGProps<SVGSVGElement> & {
  name: AppIconName;
  size?: number;
};

const PATHS: Record<AppIconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  users: (
    <>
      <path d="M16 19a4 4 0 0 0-8 0" />
      <circle cx="12" cy="11" r="3" />
      <path d="M20 19a3 3 0 0 0-2.2-2.9" />
      <path d="M4 19a3 3 0 0 1 2.2-2.9" />
    </>
  ),
  message: (
    <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.5 3.5V15H7.5A2.5 2.5 0 0 1 5 12.5z" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  "chevron-right": <path d="M10 6l4 6-4 6" />,
  "arrow-left": <path d="M14 6l-6 6 6 6" />,
  x: <path d="M8 8l8 8M16 8l-8 8" />,
  eye: (
    <>
      <path d="M2.5 12.5S6 7 12 7s9.5 5.5 9.5 5.5S18 18 12 18 2.5 12.5 2.5 12.5z" />
      <circle cx="12" cy="12.5" r="2.5" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 4l18 18" />
      <path d="M10.7 10.7a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M7.2 7.7C5.4 9 3.9 10.8 2.5 12.5 6 17 12 17 12 17s1.8-.2 3.4-1" />
      <path d="M14.8 9.2C16.6 10.5 18.1 12.3 19.5 14 16 18.5 12 18.5 12 18.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
    </>
  ),
  send: (
    <>
      <path d="M4 12 20 4l-3 16-4-6-6-4z" />
      <path d="M20 4 9 13" />
    </>
  ),
  "external-link": (
    <>
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21H7.5A2.5 2.5 0 0 1 5 18.5z" />
      <path d="M8 3v18" />
    </>
  ),
  play: (
    <path d="M9 7.5v9l8-4.5-8-4.5z" />
  ),
};

/** 全站統一線條 icon（stroke、圓角端點） */
export function AppIcon({ name, size = 20, className = "", ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
