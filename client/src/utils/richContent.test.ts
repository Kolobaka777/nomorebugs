// The bridge between text written under the old markdown-ish lesson
// convention and the Tiptap document the app stores now. Lesson bodies are
// still authored in that convention (see server/db/seedFrontendCourses.js),
// so what this turns them into is what a reader actually sees.
import { describe, it, expect } from 'vitest';
import { parseRichContent, richContentToPlainText, EMPTY_RICH_DOC } from './richContent';

const types = (doc: any) => doc.content.map((n: any) => n.type);
const codeOf = (doc: any) => doc.content.find((n: any) => n.type === 'codeBlock')?.content?.[0]?.text;

describe('parseRichContent', () => {
  it('keeps a Tiptap document as it is', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'уже документ' }] }] };
    expect(parseRichContent(JSON.stringify(doc))).toEqual(doc);
  });

  it('gives empty content an empty document rather than null', () => {
    expect(parseRichContent('')).toEqual(EMPTY_RICH_DOC);
    expect(parseRichContent(null)).toEqual(EMPTY_RICH_DOC);
    expect(parseRichContent('   ')).toEqual(EMPTY_RICH_DOC);
  });

  it('upgrades headings, lists and quotes instead of flattening them', () => {
    const doc = parseRichContent([
      '## Заголовок',
      'Обычный абзац.',
      '- первый\n- второй',
      '> подсказка',
    ].join('\n\n'));
    expect(types(doc)).toEqual(['heading', 'paragraph', 'bulletList', 'blockquote']);
  });

  it('keeps a blank line inside a code block instead of tearing the block in half', () => {
    // A blank line separates blocks everywhere except inside a fence, where
    // it is part of the code. Splitting on it first left the opening half
    // without a closing fence, so it fell through to the paragraph branch
    // and the reader got their code as prose with stray ``` in it.
    const doc = parseRichContent([
      'Пример:',
      '```\n<a class="btn">Кнопка</a>\n\n<style>\n  .btn { color: red; }\n</style>\n```',
      'После кода.',
    ].join('\n\n'));

    expect(types(doc)).toEqual(['paragraph', 'codeBlock', 'paragraph']);
    expect(codeOf(doc)).toBe('<a class="btn">Кнопка</a>\n\n<style>\n  .btn { color: red; }\n</style>');
    expect(JSON.stringify(doc)).not.toContain('```');
  });

  it('reads a fence nobody closed as code, not as prose with backticks in it', () => {
    const doc = parseRichContent('Смотри:\n\n```\nconst a = 1;\n\nconst b = 2;');
    expect(types(doc)).toEqual(['paragraph', 'codeBlock']);
    expect(codeOf(doc)).toBe('const a = 1;\n\nconst b = 2;');
  });

  it('does not treat a line of prose that merely mentions a list as a list', () => {
    const doc = parseRichContent('Сначала абзац.\n- а вот это пункт');
    // Mixed block: not every line is an item, so it stays a paragraph.
    expect(types(doc)).toEqual(['paragraph']);
  });

  it('flattens a document to plain text for previews', () => {
    const doc = parseRichContent('## Заголовок\n\nТекст абзаца.');
    expect(richContentToPlainText(JSON.stringify(doc))).toBe('Заголовок Текст абзаца.');
  });
});
