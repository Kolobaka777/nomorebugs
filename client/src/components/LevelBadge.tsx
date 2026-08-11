import { getLevel, getLevelXpPercent } from '../types';
import Icon, { IconName } from './Icon';

interface LevelBadgeProps {
  lecturesCompleted: number;
  isLead?: boolean;
  showXp?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function LevelBadge({ lecturesCompleted, isLead = false, showXp = false, size = 'md' }: LevelBadgeProps) {
  const level = getLevel(lecturesCompleted, isLead);
  const xpPercent = getLevelXpPercent(lecturesCompleted);

  const iconSize = size === 'sm' ? 16 : size === 'md' ? 24 : 36;
  const nameSize = size === 'sm' ? 'text-[11px]' : size === 'md' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          background: '#1F2833',
          border: '1px solid #EF9F27',
          boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
        }}
      >
        <Icon name={level.icon as IconName} size={iconSize} color="#EF9F27" />
        <div>
          <p className={`font-pixel ${level.color} ${nameSize}`} style={{ lineHeight: 1.6 }}>
            {level.name}
          </p>
          {size !== 'sm' && (
            <p className="text-pixel/60 text-xs font-sans">{lecturesCompleted}/10 курсов</p>
          )}
        </div>
      </div>

      {showXp && (
        <div className="w-full">
          <div className="xp-bar-track-amber" style={{ height: '8px' }}>
            <div
              className="xp-bar-fill-amber"
              style={{ width: `${xpPercent}%`, height: '8px' }}
            />
          </div>
          <p className="text-pixel/60 text-xs font-sans mt-1 text-right">
            XP: {Math.round(xpPercent)}%
          </p>
        </div>
      )}
    </div>
  );
}
