import { useState } from 'react';
import { checklistApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { MODAL_COLORS } from './types';
import Modal from '../Modal';
import Icon from '../Icon';
import { ACCENT, PAGE_BG, TEXT_MUTED } from '../../utils/theme';

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
    <Modal title="Новый чеклист вручную" onClose={onClose} maxWidth={512}>
        <div className="space-y-4">
          <div>
            <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Название шаблона *</label>
            <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Быстрая проверка формы" />
          </div>

          <div>
            <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Цвет</label>
            <div className="flex gap-2">
              {MODAL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-lg cursor-pointer transition-transform"
                  style={{ background: c, outline: color === c ? `3px solid #fff` : 'none', outlineOffset: 2, transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
                  aria-label={`Выбрать цвет ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Пункты проверки</label>
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
                    className="shrink-0 cursor-pointer flex items-center transition-colors"
                    style={{ color: '#e05252' }}
                    aria-label="Удалить пункт"
                  >
                    <Icon name="close" size={16} color="currentColor" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems(prev => [...prev, { category: prev[prev.length - 1]?.category || 'Общее', text: '' }])}
              className="btn-secondary text-xs px-3 py-1.5 mt-2 flex items-center gap-1.5"
            >
              <Icon name="sparkle" size={14} color="currentColor" /> Пункт
            </button>
          </div>

          {error && <p className="text-xs font-geist break-words" style={{ color: '#e05252' }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 text-sm font-geist font-semibold rounded-lg cursor-pointer disabled:opacity-50 transition-transform hover:-translate-y-0.5"
            style={{ background: ACCENT, color: PAGE_BG }}
          >
            {loading ? '...' : 'Создать'}
          </button>
        </div>
    </Modal>
  );
}
