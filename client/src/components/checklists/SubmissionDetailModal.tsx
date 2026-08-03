import { useEscapeKey } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import { catColor } from './types';
import type { SubmissionDetail } from './types';

export default function SubmissionDetailModal({ sub, onClose }: { sub: SubmissionDetail; onClose: () => void }) {
  useEscapeKey(onClose);
  const fails = sub.results.filter(r => r.status === 'fail');
  const oks = sub.results.filter(r => r.status === 'ok');

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded"
        style={{ background: '#1a1a2e', border: `2px solid ${sub.color}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 px-5 py-3 flex items-center justify-between" style={{ background: '#1a1a2e', borderBottom: '1px solid rgba(232,232,208,0.08)' }}>
          <div>
            <p className="text-pixel font-sans font-semibold text-sm">{sub.task_name}</p>
            <p className="text-pixel/60 text-xs font-sans mt-0.5">
              {sub.tester_name} · {sub.template_name} · {parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
            </p>
            {(sub.content_author || sub.verska_author) && (
              <p className="text-pixel/55 text-xs font-sans mt-0.5">
                {sub.content_author && `Контент: ${sub.content_author}`}
                {sub.content_author && sub.verska_author && ' · '}
                {sub.verska_author && `Верстка: ${sub.verska_author}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-sans font-semibold" style={{ color: '#e05252' }}>{fails.length} ✗</span>
            <span className="text-xs font-sans font-semibold" style={{ color: '#1D9E75' }}>{oks.length} ✓</span>
            <button onClick={onClose} aria-label="Закрыть детали проверки" className="text-pixel/60 text-lg cursor-pointer hover:text-pixel/80 ml-2">✕</button>
          </div>
        </div>
        <div className="p-5">
          {fails.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-sans font-semibold mb-3" style={{ color: '#e05252' }}>✗ Ошибки ({fails.length})</p>
              <div className="space-y-1.5">
                {fails.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start p-2 rounded" style={{ background: 'rgba(224,82,82,0.06)' }}>
                    <span style={{ color: '#e05252', flexShrink: 0, fontSize: '0.8rem' }}>✗</span>
                    <div>
                      <span className="text-xs font-sans px-1.5 py-0.5 rounded mr-2" style={{ background: `${catColor(r.category)}20`, color: catColor(r.category), fontSize: '0.6rem' }}>{r.category}</span>
                      <span className="text-sm font-sans" style={{ color: 'rgba(232,232,208,0.75)' }}>{r.text}</span>
                      {r.note && (
                        <p className="text-xs font-sans mt-1" style={{ color: 'rgba(232,232,208,0.55)' }}>{r.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {oks.length > 0 && (
            <div>
              <p className="text-xs font-sans font-semibold mb-3" style={{ color: '#1D9E75' }}>✓ ОК ({oks.length})</p>
              <div className="space-y-1">
                {oks.map((r, i) => (
                  <div key={i} className="flex gap-3 items-center py-1" style={{ borderBottom: '1px solid rgba(29,158,117,0.08)' }}>
                    <span style={{ color: '#1D9E75', flexShrink: 0, fontSize: '0.8rem' }}>✓</span>
                    <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
