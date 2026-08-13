import { useState, useRef } from 'react';
import { checklistApi } from '../../api';
import { clickableProps, useEscapeKey } from '../../utils/a11y';
import { MODAL_COLORS } from './types';
import Modal from '../Modal';
import Icon from '../Icon';
import { ACCENT, PAGE_BG, TEXT_MUTED } from '../../utils/theme';

export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (id: number) => void }) {
  useEscapeKey(onClose);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7F77DD');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: number; item_count: number; category_count: number; warning: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!name.trim()) { setError('Введите название'); return; }
    if (!file) { setError('Выберите файл'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await checklistApi.importTemplate(file, name.trim(), color);
      // Show a summary instead of closing immediately — the import parser
      // is a best-effort heuristic (category detection can misfire on an
      // unexpected file layout), so surfacing what actually got imported
      // lets the lead catch a bad parse right away instead of discovering
      // it later when testers use a broken checklist.
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Импорт чеклиста из Excel" onClose={onClose} maxWidth={448}>
        {result ? (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4"
              style={{
                background: result.warning ? 'rgba(239,159,39,0.08)' : 'rgba(102, 252, 241,0.08)',
                border: `1px solid ${result.warning ? 'rgba(239,159,39,0.35)' : 'rgba(102, 252, 241,0.35)'}`,
              }}
            >
              <p className="text-sm font-geist font-semibold mb-1 flex items-center gap-1.5" style={{ color: result.warning ? '#EF9F27' : ACCENT }}>
                <Icon name={result.warning ? 'warning' : 'check'} size={16} color="currentColor" />
                {result.warning ? 'Импортировано, но стоит проверить' : 'Импортировано успешно'}
              </p>
              <p className="text-xs font-geist" style={{ color: 'rgba(197, 198, 199,0.7)' }}>
                {result.item_count} пункт(ов) в {result.category_count} категори{result.category_count === 1 ? 'и' : 'ях'}
              </p>
              {result.warning && (
                <p className="text-xs font-geist mt-2 break-words" style={{ color: 'rgba(197, 198, 199,0.7)' }}>{result.warning}</p>
              )}
            </div>
            <button
              onClick={() => onImported(result.id)}
              className="w-full py-3 text-sm font-geist font-semibold rounded-lg cursor-pointer transition-all hover:brightness-110"
              style={{ background: ACCENT, color: PAGE_BG }}
            >
              Готово
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Название шаблона *</label>
              <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Прелендинг v2" />
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
              <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Excel файл (.xlsx) *</label>
              <div
                className="p-4 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors"
                style={{ borderColor: file ? ACCENT : 'rgba(197, 198, 199,0.15)', background: file ? 'rgba(102, 252, 241,0.05)' : 'transparent' }}
                onClick={() => fileRef.current?.click()}
                {...clickableProps(() => fileRef.current?.click())}
              >
                {file
                  ? <p className="text-xs font-geist flex items-center justify-center gap-1.5" style={{ color: ACCENT }}><Icon name="check" size={14} color="currentColor" /><span className="break-words min-w-0">{file.name}</span></p>
                  : <p className="text-xs font-geist" style={{ color: 'rgba(197, 198, 199,0.55)' }}>Нажмите для выбора файла</p>
                }
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            {error && <p className="text-xs font-geist break-words" style={{ color: '#e05252' }}>{error}</p>}

            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full py-3 text-sm font-geist font-semibold rounded-lg cursor-pointer transition-all hover:brightness-110"
              style={{ background: ACCENT, color: PAGE_BG, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Загружаю...' : 'Импортировать'}
            </button>
          </div>
        )}
    </Modal>
  );
}
