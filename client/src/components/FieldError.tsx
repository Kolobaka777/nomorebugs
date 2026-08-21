import { PAGE_BG, BADGE_NOTIFY, TEXT_MUTED, CARD_BG, CARD_SHADOW } from '../utils/theme';

// The kit's validation callout: an amber-outlined card with a `!` badge, a
// title that names the problem and a line that says what to do about it,
// pointing at the field it belongs to.
//
// Distinct from a server error on purpose. A red box says "the request
// failed"; this says "what you typed will not be accepted", which is the
// reader's own to fix. Every form in the app had only the first kind, so a
// bad email and a dead server looked the same.
export default function FieldError({ title, children, pointer = 'down' }: {
  title: string;
  children?: React.ReactNode;
  pointer?: 'down' | 'up' | 'none';
}) {
  return (
    <div role="alert" className="relative rounded-lg px-3 py-2.5" style={{ background: CARD_BG, border: `1px solid ${BADGE_NOTIFY}`, boxShadow: CARD_SHADOW }}>
      <p className="font-geist font-semibold flex items-center gap-2 break-words" style={{ fontSize: 13, color: BADGE_NOTIFY }}>
        <span
          aria-hidden="true"
          className="flex items-center justify-center shrink-0 font-bold"
          style={{ width: 16, height: 16, borderRadius: 3, background: BADGE_NOTIFY, color: PAGE_BG, fontSize: 11, lineHeight: '16px' }}
        >
          !
        </span>
        {title}
      </p>
      {children && (
        <p className="font-geist mt-1 break-words" style={{ fontSize: 12, color: TEXT_MUTED }}>{children}</p>
      )}
      {pointer !== 'none' && (
        // A triangle made of borders, in the card's own colours, so it stays
        // attached when the card is recoloured.
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: 20,
            [pointer === 'down' ? 'top' : 'bottom']: '100%',
            width: 0, height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            [pointer === 'down' ? 'borderTop' : 'borderBottom']: `7px solid ${BADGE_NOTIFY}`,
          } as React.CSSProperties}
        />
      )}
    </div>
  );
}
