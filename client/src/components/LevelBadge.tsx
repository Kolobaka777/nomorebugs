import { getLevel, getLevelXpPercent } from '../types';

interface LevelBadgeProps {
  lecturesCompleted: number;
  isLead?: boolean;
  showXp?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function LevelBadge({ lecturesCompleted, isLead = false, showXp = false, size = 'md' }: LevelBadgeProps) {
  const level = getLevel(lecturesCompleted, isLead);
  const xpPercent = getLevelXpPercent(lecturesCompleted);

  const emojiSize = size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-4xl';
  const nameSize = size === 'sm' ? 'text-[8px]' : size === 'md' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded"
        style={{
          background: '#1a1a2e',
          boxShadow: '2px 0 0 0 #EF9F27, -2px 0 0 0 #EF9F27, 0 2px 0 0 #EF9F27, 0 -2px 0 0 #EF9F27',
        }}
      >
        <span className={emojiSize}>{level.emoji}</span>
        <div>
          <p className={`font-pixel ${level.color} ${nameSize}`} style={{ lineHeight: 1.6 }}>
            {level.name}
          </p>
          {size !== 'sm' && (
            <p className="text-pixel/40 text-xs font-sans">{lecturesCompleted}/10 курсов</p>
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
          <p className="text-pixel/40 text-xs font-sans mt-1 text-right">
            XP: {Math.round(xpPercent)}%
          </p>
        </div>
      )}
    </div>
  );
}
