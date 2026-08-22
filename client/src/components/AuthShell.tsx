import { ReactNode, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import Icon from './Icon';
import {
  ACCENT, BADGE_NOTIFY, CARD_BG_PATTERN, CARD_SHADOW_TALL,
  PAGE_BG, PAGE_GRADIENT, TEXT_MUTED, TEXT_PRIMARY,
} from '../utils/theme';

// The four ways in and out of an account — sign in, register, ask for a
// reset link, set a new password — are one screen with four bodies. They
// used to be four hand-built pages, which is how they ended up with three
// different card widths, two different input treatments and an error that
// appeared as a banner above the form on one of them and beside the field on
// another.

export const AUTH_FIELD: CSSProperties = {
  width: '100%',
  background: PAGE_BG,
  color: TEXT_PRIMARY,
  fontFamily: 'Geist, system-ui, sans-serif',
  fontSize: 15,
  lineHeight: 1.4,
  padding: '15px 18px',
  borderRadius: 8,
  border: `1px solid ${ACCENT}80`,
  outline: 'none',
};

// A bad field is outlined in amber and says why underneath. Amber rather than
// the app's error red: nothing has failed yet, the form is telling you what
// it needs before you send it.
export const AUTH_FIELD_BAD: CSSProperties = {
  ...AUTH_FIELD,
  border: `1px solid ${BADGE_NOTIFY}`,
  paddingRight: 44,
};

export const AUTH_BTN: CSSProperties = {
  width: '100%',
  background: ACCENT,
  color: PAGE_BG,
  borderRadius: 8,
  padding: '15px 20px',
  fontFamily: 'Geist, system-ui, sans-serif',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

// Sits inside the field at the right, so flagging a field never reflows the
// form under the reader's cursor.
export function FieldWarning({ message }: { message: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute flex items-center justify-center"
        style={{ right: 14, top: 15, width: 20, height: 20, borderRadius: 4, background: BADGE_NOTIFY }}
      >
        <span className="font-geist font-bold" style={{ fontSize: 13, color: PAGE_BG, lineHeight: 1 }}>!</span>
      </span>
      <p className="font-geist" style={{ fontSize: 13, color: BADGE_NOTIFY, marginTop: 6 }}>
        {message}
      </p>
    </>
  );
}

// A button rather than an anchor, like every other in-app navigation on
// these four screens: they are rendered outside a Router in tests, and the
// destination is always a route this app owns.
export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="font-geist block w-full text-center cursor-pointer transition-colors hover:brightness-125"
      style={{ fontSize: 14, color: ACCENT }}
    >
      {children}
    </button>
  );
}

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  // The two lines under the card. Rendered here rather than by each page so
  // the gap above them is the same everywhere.
  footer?: ReactNode;
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: PAGE_GRADIENT }}>
      <div className="w-full fade-in" style={{ maxWidth: 430 }}>
        <div className="flex justify-center" style={{ marginBottom: 26 }}>
          <img src={logoUrl} alt="baganet" style={{ width: 268, height: 58, objectFit: 'contain' }} />
        </div>

        <div style={{ background: CARD_BG_PATTERN, borderRadius: 12, boxShadow: CARD_SHADOW_TALL, padding: '30px 28px' }}>
          <h1
            className="font-geist text-center"
            style={{ fontSize: 24, fontWeight: 600, color: TEXT_PRIMARY, letterSpacing: '0.2px' }}
          >
            {title}
          </h1>
          <p className="font-geist text-center" style={{ fontSize: 15, color: TEXT_MUTED, marginTop: 4 }}>
            {subtitle}
          </p>

          <div style={{ marginTop: 26 }}>{children}</div>

          {footer && <div className="flex flex-col gap-1" style={{ marginTop: 24 }}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}

// The remember-me box, which only the sign-in form has, but which has to
// match the fields above it.
export function RememberMe({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
        aria-label="Запомнить меня"
      />
      <span
        aria-hidden="true"
        className="flex items-center justify-center shrink-0"
        style={{
          width: 20, height: 20, borderRadius: 4,
          background: checked ? ACCENT : PAGE_BG,
          border: `1.5px solid ${ACCENT}`,
        }}
      >
        {checked && <Icon name="check" size={13} color={PAGE_BG} />}
      </span>
      <span className="font-geist" style={{ fontSize: 14, color: ACCENT }}>Запомнить меня</span>
    </label>
  );
}
