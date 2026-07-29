import React from 'react';

export type IconName =
  | 'bug' | 'crown' | 'bee' | 'snail' | 'warning' | 'lightbulb'
  | 'lock' | 'clipboard' | 'barchart' | 'floppy' | 'books' | 'user'
  | 'search' | 'sparkle' | 'pencil' | 'calendar' | 'trophy' | 'rocket'
  | 'gear' | 'globe' | 'graduation' | 'check' | 'lightning' | 'card'
  | 'seedling' | 'chartup' | 'construction' | 'memo' | 'antenna'
  | 'camera' | 'star' | 'wrench' | 'phone' | 'pin' | 'palette'
  | 'microscope' | 'beehive' | 'target';

interface PixelIconProps {
  name: IconName;
  size?: number;
  color?: string;
  color2?: string;
  className?: string;
  style?: React.CSSProperties;
}

// 8×8 pixel grids. ' '=transparent, '1'=primary color, '2'=secondary color
const ICONS: Record<IconName, string[]> = {
  bug: [
    ' 1    1 ',
    '  1111  ',
    ' 1 11 1 ',
    ' 111111 ',
    '1 1  1 1',
    ' 111111 ',
    '1      1',
    '        ',
  ],
  crown: [
    '1  11  1',
    '1  11  1',
    '1 1111 1',
    '11111111',
    '11111111',
    ' 111111 ',
    '        ',
    '        ',
  ],
  bee: [
    ' 1    1 ',
    '  1111  ',
    ' 122221 ',
    ' 111111 ',
    ' 122221 ',
    '  1111  ',
    '   11   ',
    '        ',
  ],
  snail: [
    '  111   ',
    ' 12121  ',
    ' 11111  ',
    '  111   ',
    '11111111',
    '11111111',
    ' 1   1  ',
    '        ',
  ],
  warning: [
    '   11   ',
    '  1  1  ',
    ' 1 11 1 ',
    '1  11  1',
    '1  11  1',
    '1      1',
    '11111111',
    '        ',
  ],
  lightbulb: [
    '  1111  ',
    ' 1    1 ',
    '1      1',
    '1      1',
    ' 1    1 ',
    '  1221  ',
    '  1111  ',
    '  1111  ',
  ],
  lock: [
    '  1111  ',
    ' 1    1 ',
    ' 1    1 ',
    '11111111',
    '11111111',
    '11 11 11',
    '11111111',
    '11111111',
  ],
  clipboard: [
    '  1221  ',
    ' 111111 ',
    '11111111',
    '1 1111 1',
    '1 1111 1',
    '1 111  1',
    '1      1',
    '11111111',
  ],
  barchart: [
    '      11',
    '    1 11',
    '    1 11',
    '  1 1 11',
    '  1 1 11',
    '1 1 1 11',
    '1 1 1 11',
    '11111111',
  ],
  floppy: [
    '11111111',
    '12222221',
    '12222221',
    '11111111',
    '11 11 11',
    '11 22 11',
    '11 22 11',
    '11111111',
  ],
  books: [
    '11111111',
    '11      ',
    '11  1111',
    '11  1111',
    '11  1111',
    '11  1111',
    '11      ',
    '11111111',
  ],
  user: [
    '  1111  ',
    '  1111  ',
    '  1111  ',
    '  1111  ',
    ' 111111 ',
    '11111111',
    '11111111',
    '        ',
  ],
  search: [
    ' 1111   ',
    '1    1  ',
    '1    1  ',
    '1    1  ',
    ' 1111   ',
    '    111 ',
    '     111',
    '      11',
  ],
  sparkle: [
    '   11   ',
    '  1111  ',
    '11111111',
    ' 111111 ',
    '  1111  ',
    '   11   ',
    '        ',
    '        ',
  ],
  pencil: [
    '      11',
    '     111',
    '    1111',
    '   11111',
    '  111111',
    ' 1111111',
    '   111  ',
    '    1   ',
  ],
  calendar: [
    '1 1  1 1',
    '11111111',
    '11111111',
    '1 1  1 1',
    '1 1  1 1',
    '1 1  1 1',
    '1      1',
    '11111111',
  ],
  trophy: [
    ' 111111 ',
    '11111111',
    '11111111',
    ' 111111 ',
    '  1111  ',
    ' 111111 ',
    '11111111',
    '        ',
  ],
  rocket: [
    '   11   ',
    '  1111  ',
    ' 111111 ',
    ' 111111 ',
    '11111111',
    '1 1  1 1',
    ' 1    1 ',
    '  1  1  ',
  ],
  gear: [
    '  1111  ',
    '11111111',
    '1 1111 1',
    '11 11 11',
    '11 11 11',
    '1 1111 1',
    '11111111',
    '  1111  ',
  ],
  globe: [
    '  1111  ',
    ' 1 11 1 ',
    '11 11 11',
    '1  11  1',
    '11 11 11',
    ' 1 11 1 ',
    '  1111  ',
    '        ',
  ],
  graduation: [
    '11111111',
    '11111111',
    ' 111111 ',
    '  1111  ',
    '  1111  ',
    '   11   ',
    '   111  ',
    '        ',
  ],
  check: [
    '       1',
    '      11',
    '     111',
    '1   111 ',
    '11 111  ',
    ' 11111  ',
    '  111   ',
    '   1    ',
  ],
  lightning: [
    '  11111 ',
    '  11111 ',
    '  1111  ',
    ' 111111 ',
    ' 11111  ',
    '  1111  ',
    '  111   ',
    '        ',
  ],
  card: [
    ' 111111 ',
    '11    11',
    '1 1    1',
    '1      1',
    '1      1',
    '1    1 1',
    '11    11',
    ' 111111 ',
  ],
  seedling: [
    '    1   ',
    '   111  ',
    '  11111 ',
    '   111  ',
    ' 1 1    ',
    '   1    ',
    '   1    ',
    '        ',
  ],
  chartup: [
    '       1',
    '      11',
    '    1 11',
    '   11 11',
    '  111 11',
    ' 1111 11',
    '       1',
    '11111111',
  ],
  construction: [
    '12121212',
    '21212121',
    '12121212',
    '21212121',
    '12121212',
    '21212121',
    '11111111',
    '        ',
  ],
  memo: [
    '11111111',
    '1 111111',
    ' 1111111',
    '1 1111 1',
    '1 1111 1',
    '1 111  1',
    '1      1',
    '11111111',
  ],
  antenna: [
    '1  1  1 ',
    ' 1 1 1  ',
    '  111   ',
    '   1    ',
    '   1    ',
    '   1    ',
    ' 11111  ',
    '        ',
  ],
  camera: [
    '  111   ',
    '11111111',
    '11111111',
    '11 11 11',
    '11 11 11',
    '11 11 11',
    '11111111',
    '        ',
  ],
  star: [
    '   11   ',
    '11111111',
    ' 111111 ',
    '  1111  ',
    ' 111111 ',
    '1 1111 1',
    '        ',
    '        ',
  ],
  wrench: [
    ' 111    ',
    '1   1   ',
    ' 1111   ',
    '  111   ',
    '  111   ',
    '  111   ',
    '  1111  ',
    '        ',
  ],
  phone: [
    ' 111111 ',
    '1      1',
    '1      1',
    '1      1',
    '1      1',
    '1  11  1',
    '1      1',
    ' 111111 ',
  ],
  pin: [
    '  1111  ',
    ' 111111 ',
    '11111111',
    '11111111',
    ' 111111 ',
    '   11   ',
    '   11   ',
    '        ',
  ],
  palette: [
    ' 111111 ',
    '1 1  1 1',
    '1      1',
    '1 2  2 1',
    '1      1',
    '11  11 1',
    ' 111111 ',
    '        ',
  ],
  microscope: [
    '   11   ',
    '   11   ',
    '  1111  ',
    '  1111  ',
    '  1111  ',
    '11 11 11',
    '11    11',
    '11111111',
  ],
  beehive: [
    '  1111  ',
    ' 111111 ',
    '11111111',
    '11111111',
    ' 111111 ',
    '  1111  ',
    '        ',
    '        ',
  ],
  target: [
    '  1111  ',
    ' 1    1 ',
    '1  11  1',
    '1 1  1 1',
    '1 1  1 1',
    '1  11  1',
    ' 1    1 ',
    '  1111  ',
  ],
};

export default function PixelIcon({
  name,
  size = 16,
  color = 'currentColor',
  color2,
  className,
  style,
}: PixelIconProps) {
  const grid = ICONS[name];
  if (!grid) return null;

  const c2 = color2 ?? 'rgba(0,0,0,0.45)';
  const rows = grid.length;
  const cols = 8;
  const px = size / cols;

  const rects: React.ReactElement[] = [];
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    for (let x = 0; x < cols; x++) {
      const ch = row[x] ?? ' ';
      if (ch === ' ') continue;
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x * px}
          y={y * px}
          width={px}
          height={px}
          fill={ch === '2' ? c2 : color}
        />
      );
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', imageRendering: 'pixelated', flexShrink: 0, ...style }}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}
