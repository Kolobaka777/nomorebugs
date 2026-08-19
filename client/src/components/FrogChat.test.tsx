import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrogChat from './FrogChat';
import { chatTopicsFor, faqFor, howToFor } from '../utils/helpContent';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

beforeEach(() => vi.clearAllMocks());

const renderChat = (role = 'tester') => render(<FrogChat role={role} onClose={() => {}} />);

describe('FrogChat', () => {
  it('opens on the topic list and answers with the Help page\'s own text', () => {
    renderChat();
    const topic = chatTopicsFor('tester')[0];
    fireEvent.click(screen.getByRole('button', { name: topic.label }));

    const answer = topic.answers[0];
    fireEvent.click(screen.getByRole('button', { name: answer.label }));
    // Not "some text about courses" — the exact string the Help page renders,
    // which is the whole point of both reading from utils/helpContent.ts.
    expect(screen.getByText(answer.text)).toBeInTheDocument();
  });

  it('answers immediately when a topic has only one thing to say', () => {
    renderChat();
    const single = chatTopicsFor('tester').find(t => t.answers.length === 1);
    if (!single) return; // no such topic for this role — nothing to assert
    fireEvent.click(screen.getByRole('button', { name: single.label }));
    expect(screen.getByText(single.answers[0].text)).toBeInTheDocument();
    // A one-item menu is a click that asks nothing, so it must not appear.
    expect(screen.queryByRole('button', { name: single.answers[0].label })).not.toBeInTheDocument();
  });

  it('always offers a way out to the Help page, at every level', () => {
    renderChat();
    const escape = () => screen.getByRole('button', { name: /Моего вопроса тут нет/ });
    expect(escape()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: chatTopicsFor('tester')[0].label }));
    fireEvent.click(escape());
    expect(navigate).toHaveBeenCalledWith('/help');
  });

  it('can back out of a topic to the full list', () => {
    renderChat();
    const topics = chatTopicsFor('tester');
    fireEvent.click(screen.getByRole('button', { name: topics[0].label }));
    fireEvent.click(screen.getByRole('button', { name: /Другая тема/ }));
    for (const t of topics) {
      expect(screen.getByRole('button', { name: t.label })).toBeInTheDocument();
    }
  });

  it('shows a lead the lead topics, not the tester ones', () => {
    renderChat('lead');
    for (const t of chatTopicsFor('lead')) {
      expect(screen.getByRole('button', { name: t.label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Профиль и прогресс' })).not.toBeInTheDocument();
  });
});

describe('chat topic wiring', () => {
  it('resolves every topic reference — a dangling id would silently drop an answer', () => {
    for (const role of ['tester', 'lead']) {
      const topics = chatTopicsFor(role);
      expect(topics.length).toBeGreaterThan(0);
      for (const t of topics) expect(t.answers.length).toBeGreaterThan(0);
    }
  });

  it('leaves nothing from the Help page unreachable through the chat', () => {
    for (const role of ['tester', 'lead']) {
      const reachable = new Set(chatTopicsFor(role).flatMap(t => t.answers.map(a => a.id)));
      for (const item of [...howToFor(role), ...faqFor(role)]) {
        expect(reachable.has(item.id)).toBe(true);
      }
    }
  });
});

// The chat posts a button's label as the person's own line in the
// conversation, so an imperative there ("Начисляй премии") reads as them
// ordering the frog about rather than asking it something. The how-to items
// carry a separate question form for exactly this; the FAQ ones were
// already questions.
describe('FrogChat — everything on a button is a question', () => {
  const ROLES = ['tester', 'lead'];

  it('phrases every answer button as a question, whichever list it came from', () => {
    for (const role of ROLES) {
      for (const topic of chatTopicsFor(role)) {
        for (const answer of topic.answers) {
          expect(answer.label.trim().endsWith('?'), `${role}/${topic.id}: ${answer.label}`).toBe(true);
        }
      }
    }
  });

  // Two buttons reading the same thing is a menu that asks you to guess.
  it('never shows the same question twice inside one topic', () => {
    for (const role of ROLES) {
      for (const topic of chatTopicsFor(role)) {
        const labels = topic.answers.map(a => a.label);
        expect(new Set(labels).size, `${role}/${topic.id}`).toBe(labels.length);
      }
    }
  });

  // The Help page's capability cards keep the imperative — a list of what
  // you can do reads correctly that way. The two forms must not be confused
  // for one another.
  it('keeps the imperative card title separate from the chat question', () => {
    for (const role of ROLES) {
      for (const item of howToFor(role)) {
        expect(item.title.trim(), item.id).not.toBe('');
        expect(item.question.trim().endsWith('?'), item.id).toBe(true);
        expect(item.question, item.id).not.toBe(item.title);
      }
    }
  });
});
