import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { leadApi } from '../../api';
import { apiErrorMessage } from '../../utils/toast';
import { CARD_BG, TEXT_PRIMARY, TEXT_MUTED, BADGE_NOTIFY, ERROR } from '../../utils/theme';

interface Rule { key: string; amount: number; label: string }

// What earns bug-coins, read from the server rather than written out here:
// the table this renders is the same one the awards are actually paid from
// (COIN_REWARDS in server/src/routeHelpers.js), so the breakdown a lead
// reads can never describe a scheme the server does not run.
//
// The scheme is anchored on one number — finishing a module — and every
// other course reward is a multiple of it, which is why the module row is
// called out above the list instead of sitting in it as a peer.
export default function CoinRulesCard() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [passScore, setPassScore] = useState(60);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    leadApi.getCoinRules()
      .then(r => { setRules(r.data.rules); setPassScore(r.data.passScore); })
      .catch(e => setError(apiErrorMessage(e, 'Не удалось загрузить разбивку начислений.')));
  };

  useEffect(load, []);

  const base = rules?.find(r => r.key === 'moduleCompleted');
  const rest = (rules || []).filter(r => r.key !== 'moduleCompleted');

  return (
    <div className="rounded-lg p-5 mb-6" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon name="lightning" size={18} color={BADGE_NOTIFY} />
        <p className="font-montserrat font-semibold" style={{ fontSize: 15, color: TEXT_PRIMARY }}>За что начисляются баг-коины</p>
      </div>

      {error ? (
        <div>
          <p className="font-geist text-xs mb-3 break-words" style={{ color: ERROR }}>{error}</p>
          <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      ) : !rules ? (
        <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>Загружаю…</p>
      ) : (
        <>
          {base && (
            <p className="font-geist text-xs mb-3" style={{ color: TEXT_MUTED }}>
              Основа схемы — <b style={{ color: BADGE_NOTIFY }}>{base.amount}</b> за пройденный модуль. Всё остальное считается от этого числа.
              Тест засчитывается от {passScore}%, пересдавать можно сколько угодно — сохраняется лучший результат.
            </p>
          )}
          <div className="space-y-1">
            {[...(base ? [base] : []), ...rest].map(r => (
              <div key={r.key} className="flex items-baseline justify-between gap-4 font-geist text-xs py-1" style={{ borderBottom: '1px solid rgba(197, 198, 199, 0.07)' }}>
                <span className="break-words min-w-0" style={{ color: 'rgba(197, 198, 199, 0.8)' }}>{r.label}</span>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: BADGE_NOTIFY }}>+{r.amount}</span>
              </div>
            ))}
          </div>
          <p className="font-geist text-xs mt-3" style={{ color: TEXT_MUTED }}>
            Каждое начисление выплачивается один раз — повторно пройденный модуль второй раз не оплачивается.
          </p>
        </>
      )}
    </div>
  );
}
