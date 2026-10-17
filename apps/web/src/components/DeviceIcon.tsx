import type { DeviceType } from '@dropzone/protocol';

interface Props {
  type: DeviceType;
  className?: string;
}

/** Inline SVG silhouette per device type (FR-04). Decorative — label lives on the card. */
export function DeviceIcon({ type, className = 'h-6 w-6' }: Props) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };

  switch (type) {
    case 'phone':
      return (
        <svg {...common}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      );
    case 'tablet':
      return (
        <svg {...common}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
        </svg>
      );
    case 'laptop':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="11" rx="1.5" />
          <line x1="2" y1="19" x2="22" y2="19" />
        </svg>
      );
    case 'desktop':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="12" rx="1.5" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="15" x2="12" y2="21" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
          <line x1="12" y1="17" x2="12" y2="17.01" />
        </svg>
      );
  }
}
