// Every "prose" field across the app — guides, course description/
// requirements/lesson content, bug-example write-ups, glossary
// definitions, a lead's private note about a tester — stores the same
// shape now: a JSON-serialized Tiptap document. parseRichContent bridges
// old and new: empty content becomes a blank doc, valid Tiptap JSON is
// used as-is, and anything else (plain text written before this pass, or
// corrupted data) gets a one-time best-effort structural upgrade instead
// of collapsing into a single flat paragraph — see textToDoc below.
// (Formerly guideContent.ts/parseGuideContent — generalized when rich text
// editing rolled out beyond just guides.)
export const EMPTY_RICH_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

function textNode(text: string) {
  return text ? [{ type: 'text', text }] : undefined;
}

// Mirrors the hand-rolled markdown-subset CustomCourseLearningPage's old
// LessonContent component used to parse by hand (blank-line-separated
// blocks; "# "/"## " headings; ``` fenced code; "- " bullet lists; "> "/
// "! " callouts) — kept here so lesson text authored under that old
// convention upgrades into real headings/lists/code instead of one flat
// paragraph the first time it's opened in the new editor. Tiptap has no
// separate tip/warning callout node, so both "> " and "! " become a
// blockquote (loses the icon/color distinction, keeps the "this was
// called out" structure) — a deliberate, documented scope cut, not an
// oversight.
// Blank lines separate blocks — except inside a fenced code block, where a
// blank line is part of the code. Splitting the whole text on blank lines
// first, as this used to, tore any such fence into pieces: the opening half
// no longer ended in a fence and fell through to the paragraph branch, so
// the reader got their code as prose with stray ``` characters in it. Fences
// are therefore lifted out whole before anything else is split.
function splitBlocks(raw: string): string[] {
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fence: string[] | null = null;

  const flush = () => {
    for (const b of buffer.join('\n').split(/\n\n+/).map(x => x.trim()).filter(Boolean)) blocks.push(b);
    buffer = [];
  };

  for (const line of raw.split('\n')) {
    if (fence) {
      fence.push(line);
      if (line.trim().startsWith('```')) { blocks.push(fence.join('\n')); fence = null; }
      continue;
    }
    if (line.trim().startsWith('```')) { flush(); fence = [line]; continue; }
    buffer.push(line);
  }
  // A fence nobody closed is still code as far as its author was concerned;
  // reading it as prose would lose the formatting and show the ``` besides.
  if (fence) blocks.push(fence.join('\n'));
  flush();
  return blocks;
}

function textToDoc(raw: string): any {
  const blocks = splitBlocks(raw);
  if (blocks.length === 0) return EMPTY_RICH_DOC;

  const content = blocks.map(block => {
    if (block.startsWith('## ')) {
      return { type: 'heading', attrs: { level: 2 }, content: textNode(block.slice(3)) };
    }
    if (block.startsWith('# ')) {
      return { type: 'heading', attrs: { level: 1 }, content: textNode(block.slice(2)) };
    }
    if (block.startsWith('```')) {
      // splitBlocks already guarantees a fence arrives whole, so the only
      // question left is whether it was ever closed.
      const lines = block.split('\n');
      lines.shift();
      if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
      const code = lines.join('\n');
      return { type: 'codeBlock', content: code ? [{ type: 'text', text: code }] : undefined };
    }
    if (block.startsWith('> ') || block.startsWith('! ')) {
      return { type: 'blockquote', content: [{ type: 'paragraph', content: textNode(block.slice(2)) }] };
    }
    if (block.includes('\n') && block.split('\n').every(line => line.startsWith('- '))) {
      return {
        type: 'bulletList',
        content: block.split('\n').map(line => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: textNode(line.slice(2)) }],
        })),
      };
    }
    return { type: 'paragraph', content: textNode(block) };
  });

  return { type: 'doc', content };
}

export function parseRichContent(raw: string | null | undefined): any {
  if (!raw || !raw.trim()) return EMPTY_RICH_DOC;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
  } catch {
    // not JSON — fall through to the legacy-text upgrade path below
  }
  return textToDoc(raw);
}

// Flattens a doc/node to plain text (no formatting, block boundaries become
// single spaces) — for contexts too small/frequent to mount a real Tiptap
// read instance per row, e.g. a lead's team list showing one line of note
// preview per tester rather than N live editors on screen at once.
function collectText(node: any, parts: string[]) {
  if (!node) return;
  if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text);
  if (Array.isArray(node.content)) node.content.forEach((child: any) => collectText(child, parts));
}

export function richContentToPlainText(raw: string | null | undefined): string {
  const doc = parseRichContent(raw);
  const parts: string[] = [];
  collectText(doc, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}