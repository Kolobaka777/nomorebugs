import { useState } from 'react';
import PixelIcon from '../PixelIcon';
import { TASK_TYPE_OPTIONS } from './types';

// Overlays a transparent native date input over a styled display div
export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const formatted = value
    ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
    : '—';
  return (
    <div className="relative" style={{ cursor: 'pointer' }}>
      <div
        className="pixel-input flex items-center justify-between select-none"
        style={{ pointerEvents: 'none' }}
      >
        <span style={{ color: 'rgba(232,232,208,0.82)' }}>{formatted}</span>
        <PixelIcon name="calendar" size={13} color="rgba(232,232,208,0.35)" />
      </div>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full cursor-pointer"
        style={{ opacity: 0, zIndex: 1 }}
      />
    </div>
  );
}

export function AuthorSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [isCustom, setIsCustom] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      onChange(e.target.value);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2 items-center">
        <input
          className="pixel-input flex-1"
          maxLength={1}
          placeholder="Буква"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase().slice(0, 1))}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setIsCustom(false); onChange(''); }}
          className="text-sm cursor-pointer shrink-0"
          style={{ color: 'rgba(232,232,208,0.6)' }}
          title="Назад к списку"
        >↩</button>
      </div>
    );
  }

  return (
    <select className="pixel-input" value={value} onChange={handleSelectChange}>
      <option value="">— не выбрано —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      {options.length > 0 && <option disabled>──────────</option>}
      <option value="__custom__">Ввести вручную...</option>
    </select>
  );
}

export function TaskTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isCustom, setIsCustom] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      onChange(e.target.value);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2 items-center">
        <input
          className="pixel-input flex-1"
          placeholder="Введите тип задачи"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setIsCustom(false); onChange(''); }}
          className="text-sm cursor-pointer shrink-0"
          style={{ color: 'rgba(232,232,208,0.6)' }}
          title="Назад к списку"
        >↩</button>
      </div>
    );
  }

  return (
    <select className="pixel-input" value={value} onChange={handleSelectChange}>
      <option value="">— выбрать тип —</option>
      {TASK_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      <option disabled>──────────</option>
      <option value="__custom__">Другое...</option>
    </select>
  );
}
