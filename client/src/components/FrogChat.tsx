import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import PixelFrogSprite from './PixelFrogSprite';
import { ChatAnswer, ChatTopic, chatTopicsFor } from '../utils/helpContent';
import { ACCENT, CARD_BG, CARD_SHADOW_TALL, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE } from '../utils/theme';

// The support-chat widget every site has in its bottom-right corner, except
// the person on the other end is the frog and there is nobody to wait for.
// It's a guided tree, not a text box: pick a topic, pick a question, get the
// answer. Nothing here generates prose — every answer is a string the Help
// page already renders (utils/helpContent.ts), so the two can't drift.
//
// The escape hatch matters more than the tree. Somebody whose question isn't
// on any button is exactly the person a canned FAQ fails, so "моего вопроса
// тут нет" is offered at every level and drops them on the Help page rather
// than looping them back to the same list.

type Msg =
  | { from: 'frog'; text: string }
  | { from: 'me'; text: string };

const GREETING = 'Привет! Я подскажу, как тут всё устроено. О чём вопрос?';

interface Props {
  role: string;
  onClose: () => void;
}

export default function FrogChat({ role, onClose }: Props) {
  const navigate = useNavigate();
  const topics = useRef<ChatTopic[]>(chatTopicsFor(role)).current;
  const [messages, setMessages] = useState<Msg[]>([{ from: 'frog', text: GREETING }]);
  const [topic, setTopic] = useState<ChatTopic | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Every exchange appends, so the newest lines are the ones worth seeing.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Focus the panel so Escape works without first clicking inside it.
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const say = (mine: string, reply: string) =>
    setMessages(m => [...m, { from: 'me', text: mine }, { from: 'frog', text: reply }]);

  const pickTopic = (t: ChatTopic) => {
    setTopic(t);
    say(t.label, t.answers.length === 1
      ? 'Держи:'
      : 'Понял. Что именно интересует?');
    // A topic with a single answer would otherwise show a one-button menu,
    // which is a click that asks nothing — answer it straight away instead.
    if (t.answers.length === 1) {
      setMessages(m => [...m, { from: 'frog', text: t.answers[0].text }]);
    }
  };

  const pickAnswer = (a: ChatAnswer) => say(a.label, a.text);

  const toHelp = () => {
    onClose();
    navigate('/help');
  };

  const options: { key: string; label: string; onClick: () => void }[] = topic
    ? [
      ...(topic.answers.length > 1
        ? topic.answers.map(a => ({ key: a.id, label: a.label, onClick: () => pickAnswer(a) }))
        : []),
      { key: '__back', label: '← Другая тема', onClick: () => { setTopic(null); say('Другая тема', 'Хорошо, о чём тогда?'); } },
    ]
    : topics.map(t => ({ key: t.id, label: t.label, onClick: () => pickTopic(t) }));

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Чат с лягухом"
      className="frog-companion-bubble flex flex-col"
      style={{
        position: 'absolute', bottom: '104%', right: 0, width: 316, maxHeight: 420,
        background: CARD_BG, border: `1px solid ${ACCENT}`, borderRadius: 12,
        boxShadow: CARD_SHADOW_TALL, pointerEvents: 'auto', outline: 'none',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(197, 198, 199, 0.14)' }}
      >
        <PixelFrogSprite size={22} />
        <span className="font-montserrat font-semibold flex-1" style={{ fontSize: 12, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
          ЛЯГУХ
        </span>
        <button onClick={onClose} aria-label="Закрыть чат" className="cursor-pointer" style={{ color: TEXT_MUTED }}>
          <Icon name="close" size={14} color="currentColor" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ minHeight: 0 }}>
        {messages.map((m, i) => (
          <div key={i} className={m.from === 'me' ? 'flex justify-end' : 'flex justify-start'}>
            <p
              className="font-geist rounded-lg px-2.5 py-1.5"
              style={{
                fontSize: 12.5, lineHeight: 1.5, maxWidth: '86%',
                background: m.from === 'me' ? `${ACCENT}22` : 'rgba(197, 198, 199, 0.07)',
                color: m.from === 'me' ? ACCENT : TEXT_PRIMARY,
                borderBottomRightRadius: m.from === 'me' ? 2 : undefined,
                borderBottomLeftRadius: m.from === 'frog' ? 2 : undefined,
              }}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <div
        className="px-3 py-2.5 space-y-1.5 shrink-0"
        style={{ borderTop: '1px solid rgba(197, 198, 199, 0.14)' }}
      >
        {options.map(o => (
          <button
            key={o.key}
            onClick={o.onClick}
            className="w-full text-left font-geist rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors"
            style={{ fontSize: 12, color: TEXT_PRIMARY, background: 'rgba(197, 198, 199, 0.07)' }}
          >
            {o.label}
          </button>
        ))}
        <button
          onClick={toHelp}
          className="w-full text-left font-geist rounded-lg px-2.5 py-1.5 cursor-pointer flex items-center gap-1.5"
          style={{ fontSize: 12, color: PAGE_BG, background: ACCENT }}
        >
          <Icon name="lightbulb" size={13} color="currentColor" />
          Моего вопроса тут нет
        </button>
      </div>
    </div>
  );
}
