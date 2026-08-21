// Line-style icon set for the courses catalog / course-detail redesign —
// same 24x24 stroke-based construction as QuickLinkIcons.tsx (stroke={color}
// via currentColor, strokeWidth 2) so anything mixing the two icon sets on
// one page reads as one family, not two.
import { SECONDARY } from '../utils/theme';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

const DEFAULT_COLOR = SECONDARY;

export function SearchIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="2" />
      <path d="M20 20L15.5 15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth="2" />
      <path d="M8 11V7.5C8 5.29086 9.79086 3.5 12 3.5C14.2091 3.5 16 5.29086 16 7.5V11" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.5" fill={color} />
    </svg>
  );
}

export function CheckCircleIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M8 12.5L10.5 15L16 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The double tick the design marks a finished lesson with — distinct from
// CheckCircleIcon, which marks a finished *course*. Two ticks, no ring, so a
// column of them reads as a list of small confirmations rather than a column
// of medals.
// The counterpart of CheckCircleIcon: a ring with a bar through it. Marks
// the "don't do this" half of a before/after pair, where a cross would read
// as "failed" rather than as "not this way".
export function MinusCircleIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M8 12H16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DoubleCheckIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2 12.5L6 16.5L13.5 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 15.5L11.5 17L19 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PeopleIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3" stroke={color} strokeWidth="2" />
      <path d="M3.5 19C3.5 15.6863 6.13401 13 9.5 13C12.4622 13 14.9256 15.1131 15.4 17.9" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M15 5.5C16.4497 5.99164 17.5 7.35973 17.5 8.97485C17.5 10.5899 16.4497 11.958 15 12.4497" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 13.5C19.3556 14.1094 21 16.0002 21 18.4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CapIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2.5 9L12 4.5L21.5 9L12 13.5L2.5 9Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6.5 11V15.5C6.5 15.5 8.5 17.5 12 17.5C15.5 17.5 17.5 15.5 17.5 15.5V11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 9V14.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PagesIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" stroke={color} strokeWidth="2" />
      <path d="M8.5 8H15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 12H15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 16H12.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BookOpenIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 6.5C12 5 10 4 6.5 4C4.5 4 3.5 4.5 3.5 4.5V17.5C3.5 17.5 4.5 17 6.5 17C10 17 12 18 12 19.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 6.5C12 5 14 4 17.5 4C19.5 4 20.5 4.5 20.5 4.5V17.5C20.5 17.5 19.5 17 17.5 17C14 17 12 18 12 19.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 5V19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12H19" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PencilLineIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14.5 5.5L18.5 9.5L8 20H4V16L14.5 5.5Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 7L17 11" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TrashLineIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4.5 7H19.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 7V4.5H15V7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7L7.3 19C7.36 19.98 8.17 20.75 9.15 20.75H14.85C15.83 20.75 16.64 19.98 16.7 19L17.5 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 11V16.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M13.7 11V16.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
