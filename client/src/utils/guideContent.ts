// guides.content used to be a hand-rolled markdown-subset string; it's now
// a JSON-serialized Tiptap document. parseGuideContent bridges both: empty
// content becomes a blank doc, valid JSON is used as-is, and anything else
// (an old plain-text guide, or corrupted data) is wrapped as a single
// paragraph so it still renders as *something* readable instead of
// crashing the editor.
export const EMPTY_GUIDE_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export function parseGuideContent(raw: string | null | undefined): any {
  if (!raw || !raw.trim()) return EMPTY_GUIDE_DOC;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
  } catch {
    // fall through to plain-text wrapping below
  }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }],
  };
}
