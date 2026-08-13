import { useState } from 'react';
import { CARD_BG, TEXT_MUTED, ACCENT, CARD_SHADOW } from '../utils/theme';

// A curated set covering the kinds of guides this team actually writes
// (reference docs, checklists, warnings, tooling notes) plus a free-text
// field for anything else — no external emoji-picker dependency, no file
// upload, just a unicode character stored as-is.
const CURATED_EMOJI = [
  '📘', '📌', '✅', '⚠️', '🐛', '🔧', '🧪', '📋',
  '🔍', '💡', '🚀', '⏱️', '📎', '🔗', '❗', '❓',
  '🗂️', '🧩', '📦', '🛠️', '🔒', '🌐', '📝', '🎯',
];

export default function EmojiPicker({ value, onChange, onClose }: { value: string | null; onChange: (emoji: string | null) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');

  return (
    <div
      className="absolute z-10 p-3 rounded-lg"
      style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.25)', boxShadow: CARD_SHADOW, width: 240 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="grid grid-cols-8 gap-1 mb-2">
        {CURATED_EMOJI.map(e => (
          <button
            key={e}
            onClick={() => { onChange(e); onClose(); }}
            className="rounded cursor-pointer flex items-center justify-center"
            style={{ width: 24, height: 24, fontSize: 16, background: value === e ? `${ACCENT}25` : 'transparent' }}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center">
        <input
          className="pixel-input text-xs"
          style={{ height: 26, padding: '0 6px', width: 70 }}
          placeholder="свой"
          value={custom}
          maxLength={8}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { onChange(custom.trim()); onClose(); } }}
        />
        <button
          onClick={() => { if (custom.trim()) { onChange(custom.trim()); onClose(); } }}
          className="btn-secondary text-xs px-2 py-1"
          disabled={!custom.trim()}
        >
          ОК
        </button>
        {value && (
          <button onClick={() => { onChange(null); onClose(); }} className="text-xs font-geist ml-auto" style={{ color: TEXT_MUTED }}>
            Убрать
          </button>
        )}
      </div>
      <p className="text-[10px] font-geist mt-1.5" style={{ color: 'rgba(197, 198, 199, 0.45)' }}>Можно вставить любой свой эмодзи</p>
    </div>
  );
}
