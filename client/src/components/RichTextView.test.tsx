// The reading half of the app. All six places used to mount the full
// RichTextEditor with editable={false} — 699 KB of Tiptap and ProseMirror to
// display static text. What is checked here is that the replacement draws
// the same thing.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RichTextView from './RichTextView';
import { parseRichContent, EMPTY_RICH_DOC } from '../utils/richContent';

const doc = (...content: any[]) => ({ type: 'doc', content });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const view = (d: any) => render(<RichTextView content={d} />);

describe('blocks', () => {
  it('renders paragraphs', () => {
    view(doc(p('Первый'), p('Второй')));
    expect(screen.getByText('Первый').tagName).toBe('P');
    expect(screen.getByText('Второй')).toBeInTheDocument();
  });

  it('renders headings at the right level', () => {
    view(doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Раздел' }] }));
    expect(screen.getByRole('heading', { level: 2, name: 'Раздел' })).toBeInTheDocument();
  });

  it('clamps an absurd heading level into range', () => {
    view(doc({ type: 'heading', attrs: { level: 99 }, content: [{ type: 'text', text: 'Глубоко' }] }));
    expect(screen.getByText('Глубоко').tagName).toBe('H6');
  });

  it('renders lists', () => {
    view(doc(
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('Пункт')] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [p('Первый шаг')] }] },
    ));
    expect(screen.getByText('Пункт').closest('ul')).toBeTruthy();
    expect(screen.getByText('Первый шаг').closest('ol')).toBeTruthy();
  });

  it('renders a blockquote and a rule', () => {
    const { container } = view(doc({ type: 'blockquote', content: [p('Цитата')] }, { type: 'horizontalRule' }));
    expect(screen.getByText('Цитата').closest('blockquote')).toBeTruthy();
    expect(container.querySelector('hr')).toBeTruthy();
  });

  it('renders an image with its alt text', () => {
    view(doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAA', alt: 'Схема' } }));
    expect(screen.getByAltText('Схема')).toHaveAttribute('src', 'data:image/png;base64,AAA');
  });
});

describe('text formatting', () => {
  it('applies bold, italic, strike and code', () => {
    const { container } = view(doc({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'курсив', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'зачёркнутый', marks: [{ type: 'strike' }] },
        { type: 'text', text: 'код', marks: [{ type: 'code' }] },
      ],
    }));
    expect(container.querySelector('strong')?.textContent).toBe('жирный');
    expect(container.querySelector('em')?.textContent).toBe('курсив');
    expect(container.querySelector('s')?.textContent).toBe('зачёркнутый');
    expect(container.querySelector('code')?.textContent).toBe('код');
  });

  it('keeps the text even when the mark is unknown', () => {
    // A document from a newer editor loses its formatting here, not its
    // words.
    view(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Важное', marks: [{ type: 'чтотоновое' }] }] }));
    expect(screen.getByText('Важное')).toBeInTheDocument();
  });

  it('keeps the contents of an unknown container', () => {
    view(doc({ type: 'какойТоБлок', content: [p('Внутри')] }));
    expect(screen.getByText('Внутри')).toBeInTheDocument();
  });
});

describe('code', () => {
  it('renders a code block as pre > code', () => {
    const { container } = view(doc({
      type: 'codeBlock', attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const a = 1;' }],
    }));
    const code = container.querySelector('pre > code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe('const a = 1;');
    expect(code?.className).toContain('language-javascript');
  });

  it('highlights the syntax instead of emitting bare text', () => {
    // The site teaches HTML, CSS and JavaScript — losing colour in the code
    // samples would be a regression, not a trade.
    const { container } = view(doc({
      type: 'codeBlock', attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const a = 1;' }],
    }));
    expect(container.querySelectorAll('.hljs-keyword').length).toBeGreaterThan(0);
  });

  it('renders an unknown language as plain text instead of throwing', () => {
    const { container } = view(doc({
      type: 'codeBlock', attrs: { language: 'брейнфак' },
      content: [{ type: 'text', text: '+++.' }],
    }));
    expect(container.querySelector('pre > code')?.textContent).toBe('+++.');
  });

  it('renders a code block with no language too', () => {
    const { container } = view(doc({ type: 'codeBlock', content: [{ type: 'text', text: 'просто текст' }] }));
    expect(container.querySelector('pre > code')?.textContent).toBe('просто текст');
  });
});

describe('the toggle list', () => {
  it('renders a real details element that collapses without script', () => {
    const { container } = view(doc({
      type: 'details', attrs: { open: true },
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Подробности' }] },
        { type: 'detailsContent', content: [p('Скрытое')] },
      ],
    }));
    const details = container.querySelector('details[data-type="details"]');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(true);
    expect(container.querySelector('summary')?.textContent).toBe('Подробности');
    expect(screen.getByText('Скрытое')).toBeInTheDocument();
  });

  it('stays collapsed when it was saved collapsed', () => {
    const { container } = view(doc({
      type: 'details', attrs: { open: false },
      content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'Свёрнуто' }] }],
    }));
    expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
  });
});

describe('empty and broken input', () => {
  it('renders an empty document without failing', () => {
    const { container } = view(EMPTY_RICH_DOC);
    expect(container.querySelector('.rich-text-content .tiptap')).toBeTruthy();
  });

  it('survives a null document', () => {
    const { container } = render(<RichTextView content={null} />);
    expect(container.querySelector('.tiptap')).toBeTruthy();
  });

  it('survives an unknown node with no content', () => {
    const { container } = view(doc({ type: 'бабах' }, p('А это осталось')));
    expect(container.textContent).toContain('А это осталось');
  });

  it('upgrades legacy plain text through parseRichContent', () => {
    view(parseRichContent('# Заголовок\n\nОбычный абзац'));
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeInTheDocument();
    expect(screen.getByText('Обычный абзац')).toBeInTheDocument();
  });
});

describe('the wrapper', () => {
  it('carries the same classes the whole stylesheet targets', () => {
    // The rules in index.css are written against the DOM Tiptap emits. This
    // wrapper reproduces it, so both render identically.
    const { container } = view(doc(p('Текст')));
    expect(container.querySelector('.rich-text-content > .tiptap')).toBeTruthy();
  });
});
