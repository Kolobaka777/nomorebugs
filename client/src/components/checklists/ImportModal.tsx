import { useState, useRef } from 'react';
import { checklistApi } from '../../api';
import { clickableProps, useEscapeKey } from '../../utils/a11y';
import { MODAL_COLORS } from './types';

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
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded p-6" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Импорт чеклиста из Excel</p>
          <button onClick={onClose} aria-label="Закрыть окно импорта" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div
              className="rounded p-4"
              style={{
                background: result.warning ? 'rgba(239,159,39,0.08)' : 'rgba(29,158,117,0.08)',
                border: `1px solid ${result.warning ? 'rgba(239,159,39,0.35)' : 'rgba(29,158,117,0.35)'}`,
              }}
            >
              <p className="text-sm font-sans font-semibold mb-1" style={{ color: result.warning ? '#EF9F27' : '#1D9E75' }}>
                {result.warning ? '⚠ Импортировано, но стоит проверить' : '✓ Импортировано успешно'}
              </p>
              <p className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.7)' }}>
                {result.item_count} пункт(ов) в {result.category_count} категори{result.category_count === 1 ? 'и' : 'ях'}
              </p>
              {result.warning && (
                <p className="text-xs font-sans mt-2" style={{ color: 'rgba(232,232,208,0.7)' }}>{result.warning}</p>
              )}
            </div>
            <button
              onClick={() => onImported(result.id)}
              className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer"
              style={{ background: '#1D9E75', color: '#0f0f1a' }}
            >
              Готово
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-2">Название шаблона *</label>
              <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Прелендинг v2" />
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
              <label className="block text-pixel/60 text-xs font-sans mb-2">Excel файл (.xlsx) *</label>
              <div
                className="p-4 rounded border-2 border-dashed text-center cursor-pointer transition-colors"
                style={{ borderColor: file ? '#1D9E75' : 'rgba(232,232,208,0.1)', background: file ? 'rgba(29,158,117,0.05)' : 'transparent' }}
                onClick={() => fileRef.current?.click()}
                {...clickableProps(() => fileRef.current?.click())}
              >
                {file
                  ? <p className="text-xs font-sans" style={{ color: '#1D9E75' }}>✓ {file.name}</p>
                  : <p className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.55)' }}>Нажмите для выбора файла</p>
                }
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer"
              style={{ background: '#1D9E75', color: '#0f0f1a', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Загружаю...' : 'Импортировать'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
