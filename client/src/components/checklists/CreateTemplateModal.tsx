import { useState } from 'react';
import { checklistApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { MODAL_COLORS } from './types';

export default function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  useEscapeKey(onClose);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7F77DD');
  const [items, setItems] = useState<{ category: string; text: string }[]>([{ category: 'Общее', text: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (idx: number, field: 'category' | 'text', value: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Введите название'); return; }
    const cleanItems = items.filter(i => i.text.trim());
    if (cleanItems.length === 0) { setError('Добавьте хотя бы один пункт'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await checklistApi.createTemplate({ name: name.trim(), color, items: cleanItems });
      onCreated(res.data.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка создания');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded p-6 max-h-[85vh] overflow-y-auto" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Новый чеклист вручную</p>
          <button onClick={onClose} aria-label="Закрыть" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Название шаблона *</label>
            <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Быстрая проверка формы" />
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Цвет</label>
            <div className="flex gap-2">
              {MODAL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded cursor-pointer transition-transform"
                  style={{ background: c, outline: color === c ? `3px solid #fff` : 'none', outlineOffset: 2, transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Пункты проверки</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="pixel-input text-xs"
                    style={{ width: 110 }}
                    placeholder="Категория"
                    value={item.category}
                    onChange={e => updateItem(idx, 'category', e.target.value)}
                  />
                  <input
                    className="pixel-input text-xs flex-1"
                    placeholder="Текст пункта"
                    value={item.text}
                    onChange={e => updateItem(idx, 'text', e.target.value)}
                  />
                  <button
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-xs shrink-0"
                    style={{ color: '#e05252' }}
                    aria-label="Удалить пункт"
                  >✕</button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems(prev => [...prev, { category: prev[prev.length - 1]?.category || 'Общее', text: '' }])}
              className="btn-secondary text-xs px-3 py-1.5 mt-2"
            >
              + Пункт
            </button>
          </div>

          {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
            style={{ background: '#1D9E75', color: '#0f0f1a' }}
          >
            {loading ? '...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
