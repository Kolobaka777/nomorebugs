import { useEscapeKey } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import { catColor } from './types';
import type { SubmissionDetail } from './types';
import Modal from '../Modal';
import { ACCENT } from '../../utils/theme';

export default function SubmissionDetailModal({ sub, onClose }: { sub: SubmissionDetail; onClose: () => void }) {
  useEscapeKey(onClose);
  const fails = sub.results.filter(r => r.status === 'fail');
  const oks = sub.results.filter(r => r.status === 'ok');

  return (
    <Modal
      onClose={onClose}
      maxWidth={672}
      title={
        <div>
          <p className="text-sm">{sub.task_name}</p>
          <p className="text-xs font-normal mt-0.5" style={{ color: 'rgba(197, 198, 199,0.6)', letterSpacing: 0 }}>
            {sub.tester_name} · {sub.template_name} · {parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
            {(sub.content_author || sub.verska_author) && (
              <>
                {' · '}
                {sub.content_author && `Контент: ${sub.content_author}`}
                {sub.content_author && sub.verska_author && ' · '}
                {sub.verska_author && `Верстка: ${sub.verska_author}`}
              </>
            )}
          </p>
        </div>
      }
      headerRight={
        <>
          <span className="text-xs font-geist font-semibold" style={{ color: '#e05252' }}>{fails.length} ✗</span>
          <span className="text-xs font-geist font-semibold" style={{ color: ACCENT }}>{oks.length} ✓</span>
        </>
      }
    >
          {fails.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-geist font-semibold mb-3" style={{ color: '#e05252' }}>✗ Ошибки ({fails.length})</p>
              <div className="space-y-1.5">
                {fails.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start p-2 rounded-lg" style={{ background: 'rgba(224,82,82,0.06)' }}>
                    <span style={{ color: '#e05252', flexShrink: 0, fontSize: '0.8rem' }}>✗</span>
                    <div>
                      <span className="text-xs font-geist px-1.5 py-0.5 rounded mr-2" style={{ background: `${catColor(r.category)}20`, color: catColor(r.category), fontSize: 11 }}>{r.category}</span>
                      <span className="text-sm font-geist" style={{ color: 'rgba(197, 198, 199,0.75)' }}>{r.text}</span>
                      {r.note && (
                        <p className="text-xs font-geist mt-1" style={{ color: 'rgba(197, 198, 199,0.55)' }}>{r.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {oks.length > 0 && (
            <div>
              <p className="text-xs font-geist font-semibold mb-3" style={{ color: ACCENT }}>✓ ОК ({oks.length})</p>
              <div className="space-y-1">
                {oks.map((r, i) => (
                  <div key={i} className="flex gap-3 items-center py-1" style={{ borderBottom: '1px solid rgba(102, 252, 241,0.08)' }}>
                    <span style={{ color: ACCENT, flexShrink: 0, fontSize: '0.8rem' }}>✓</span>
                    <span className="text-xs font-geist" style={{ color: 'rgba(197, 198, 199,0.6)' }}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
    </Modal>
  );
}
