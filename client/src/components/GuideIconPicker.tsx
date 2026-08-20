import Icon, { IconName } from './Icon';
import { CARD_BG, TEXT_MUTED, ACCENT, CARD_SHADOW } from '../utils/theme';

// Was an emoji picker with a free-text field beside it, which meant a guide's
// icon could be any character at all and never matched the icon set the rest
// of the app draws from. Now it offers names from that set — a curated few
// covering the kinds of guides this team writes.
const GUIDE_ICONS: IconName[] = [
  'books', 'memo', 'clipboard', 'warning', 'bug', 'wrench', 'microscope', 'target',
  'search', 'lightbulb', 'rocket', 'clock', 'antenna', 'lock', 'globe', 'graduation',
  'floppy', 'card', 'barchart', 'chartup', 'gear', 'star', 'trophy', 'frog',
];

// Guides written before this stored an emoji here. Nothing renders an
// unknown value, so those simply fall back to the default glyph rather than
// putting an emoji back on screen.
export function isGuideIcon(value: string | null | undefined): value is IconName {
  return !!value && (GUIDE_ICONS as string[]).includes(value);
}

export default function GuideIconPicker({ value, onChange, onClose }: {
  value: string | null;
  onChange: (icon: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-10 p-3 rounded-lg"
      style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.25)', boxShadow: CARD_SHADOW, width: 240 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="grid grid-cols-8 gap-1 mb-2">
        {GUIDE_ICONS.map(name => (
          <button
            key={name}
            onClick={() => { onChange(name); onClose(); }}
            aria-label={name}
            className="rounded cursor-pointer flex items-center justify-center"
            style={{ width: 24, height: 24, background: value === name ? `${ACCENT}25` : 'transparent' }}
          >
            <Icon name={name} size={15} color={value === name ? ACCENT : TEXT_MUTED} />
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center justify-between">
        <button onClick={() => { onChange(null); onClose(); }} className="btn-secondary text-xs px-2 py-1">Без иконки</button>
        <button onClick={onClose} className="btn-secondary text-xs px-2 py-1">Закрыть</button>
      </div>
    </div>
  );
}
