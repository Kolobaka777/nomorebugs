// Exact SVG icons supplied by the user for the "БЫСТРЫЕ ССЫЛКИ" block on
// the redesigned homepage — pasted verbatim from her Figma export (paths
// and stroke width unchanged), not built from the app's existing 8x8
// PixelIcon grid set. Default stroke reads from theme.ts's SECONDARY
// token (the kit's "второстепенные элементы, рамки, ховеры" role, #45A29E)
// rather than a hardcoded hex, so it stays in sync if that token changes.
import { SECONDARY } from '../utils/theme';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

const DEFAULT_COLOR = SECONDARY;

export function BookIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 6V19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M21 6L21 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M3 6L3 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M21 19C21 19 20 17 16.5 17C13 17 12 19 12 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 19C12 19 11 17 7.5 17C4 17 3 19 3 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M21 6C21 6 20 4 16.5 4C13 4 12 6 12 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6C12 6 11 4 7.5 4C4 4 3 6 3 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShopIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 11C7 9.11438 7 8.17157 7.58579 7.58579C8.17157 7 9.11438 7 11 7H13C14.8856 7 15.8284 7 16.4142 7.58579C17 8.17157 17 9.11438 17 11V13C17 14.8856 17 15.8284 16.4142 16.4142C15.8284 17 14.8856 17 13 17H11C9.11438 17 8.17157 17 7.58579 16.4142C7 15.8284 7 14.8856 7 13V11Z" stroke={color} strokeWidth="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" fill={color} />
      <path d="M10 7V4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 7V4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 10L20 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M17 14L20 14" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 20V17" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 20V17" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 10L7 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 14L7 14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HomeIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.7597C5 11.4019 5 10.723 5.27446 10.1263C5.54892 9.52956 6.06437 9.08775 7.09525 8.20413L8.09525 7.34699C9.95857 5.74986 10.8902 4.95129 12 4.95129C13.1098 4.95129 14.0414 5.74986 15.9047 7.34699L16.9047 8.20413C17.9356 9.08775 18.4511 9.52956 18.7255 10.1263C19 10.723 19 11.4019 19 12.7597V17.0001C19 18.8857 19 19.8285 18.4142 20.4143C17.8284 21.0001 16.8856 21.0001 15 21.0001H9C7.11438 21.0001 6.17157 21.0001 5.58579 20.4143C5 19.8285 5 18.8857 5 17.0001V12.7597Z" stroke={color} strokeWidth="2" />
      <path d="M14.5 21V16C14.5 15.4477 14.0523 15 13.5 15H10.5C9.94772 15 9.5 15.4477 9.5 16V21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 6L15 12L9 18" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ChevronRightDoubleIcon({ size = 24, color = DEFAULT_COLOR, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 18L18 12L12 6" stroke={color} strokeWidth="2" />
      <path d="M6 18L12 12L6 6" stroke={color} strokeWidth="2" />
    </svg>
  );
}
