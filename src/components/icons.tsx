type IconProps = {
  className?: string;
  size?: number;
};

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function LibraryIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M5 4.75h4v14.5H5zM10.5 4.75h4v14.5h-4z" />
      <path d="m16.6 6.3 3.4-.9 2.3 13.5-3.4.9z" />
      <path d="M3.5 19.5h17" />
    </svg>
  );
}

export function SearchIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="m15 15 4.25 4.25" />
    </svg>
  );
}

export function HistoryIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M4.5 10.5a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4.5 5.5v5h5M12 8v4.4l3 1.8" />
    </svg>
  );
}

export function DashboardIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  );
}

export function GroupsIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <circle cx="9" cy="8" r="2.75" />
      <circle cx="16.5" cy="9" r="2.25" />
      <path d="M3.75 19c.4-3 2.3-4.75 5.25-4.75S13.85 16 14.25 19M14.4 14.5c2.4.1 4.2 1.6 4.65 4.5" />
    </svg>
  );
}

export function UsersIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.25 19.25c.6-3.7 3.2-5.75 6.75-5.75s6.15 2.05 6.75 5.75" />
    </svg>
  );
}

export function InvitationIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M14.5 9.25a4.25 4.25 0 1 0-4.1 5.45L7.5 17.5v3h3l3.1-3.1a4.25 4.25 0 0 0 .9-8.15Z" />
      <circle cx="15.25" cy="9.25" r="1.25" />
      <path d="M7.5 20.5h-3v-3" />
    </svg>
  );
}

export function ShieldIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M12 3.75 19 6.5v5.25c0 4.3-2.85 7.15-7 8.5-4.15-1.35-7-4.2-7-8.5V6.5z" />
      <path d="m8.75 12 2.1 2.1 4.4-4.4" />
    </svg>
  );
}

export function DocumentIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M6 3.75h7l5 5v11.5H6z" />
      <path d="M13 3.75v5h5M9 12h6M9 15.5h6" />
    </svg>
  );
}

export function InfoIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 10.9v5.35M12 7.8v.1" />
    </svg>
  );
}

export function MailIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <rect x="3.75" y="5.75" width="16.5" height="12.5" rx="1.5" />
      <path d="m4.5 7 7.5 5.4L19.5 7" />
    </svg>
  );
}

export function LockIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <rect x="5" y="10.25" width="14" height="9.75" rx="1.75" />
      <path d="M8.25 10.25V8a3.75 3.75 0 0 1 7.5 0v2.25M12 14v2.25" />
    </svg>
  );
}

export function ArrowRightIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
    </svg>
  );
}

export function CheckIcon({ className, size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} className={className}>
      <path d="m5 12.5 4.25 4.25L19 7" />
    </svg>
  );
}
