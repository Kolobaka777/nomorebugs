import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import diff from 'highlight.js/lib/languages/diff';
// All three live in the one package in Tiptap v3 (the old 3-package split
// — extension-details-summary/-content as separate installs — never got a
// v3 release; @tiptap/extension-details now bundles them itself).
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { CARD_BG, TEXT_MUTED, ACCENT } from '../utils/theme';
import Icon from './Icon';

// The shared block-rich-text editor used everywhere the app lets someone
// write more than a one-line field — guides, course description/
// requirements/lesson content, bug-example write-ups, glossary
// definitions, a lead's note about a tester. (Everywhere, that is, except
// the idea/complaint board — SuggestionsPage stays plain text on purpose,
// per the "не тут" instruction that scoped this whole rollout.)
// Originally guide-only (GuideEditor.tsx); generalized here once other
// surfaces needed the same editor.

// Same trade-off as user_profiles.custom_avatar (server/src/routes/profile.js)
// — images live as base64 data URIs directly inside the document rather
// than a separate file-upload endpoint, since none exists in this app.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Nine languages, named one at a time, instead of lowlight's `common`
// bundle. `common` is about 37 grammars — Fortran, Objective-C, Lua — and
// it made this the largest chunk in the build by a wide margin, bigger than
// the rest of the application put together. Every one below is something a
// QA engineer actually pastes here; `xml` is highlight.js's name for the
// grammar that covers HTML.
const lowlight = createLowlight({
  javascript, typescript, xml, css, json, sql, bash, python, diff,
});

// One uniform break rule across every block type, code blocks included:
//   Enter       → close this block, start a new one
//   Shift+Enter → stay inside the current block, just a new line
// Paragraphs/headings/list items already behave that way out of the box
// (StarterKit's HardBreak binds Shift-Enter to a hard break), but a code
// block did the exact opposite: Enter inserted a newline *inside* the block
// (prosemirror's newlineInCode, from the base keymap). So a code block is
// the only node that needs the rule spelled out.
//
// priority 900 is what makes these win: keymap plugins are ordered by
// extension priority (highest first), and at the default 100 this would tie
// with HardBreak/the base keymap and lose. It stays *below* Paragraph's 1000
// on purpose — schema node order follows the same priority sort, and a code
// block ranked above the paragraph would become the doc's default block type.
const CodeBlock = CodeBlockLowlight.extend({
  priority: 900,
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // Mod-Enter is deliberately left alone: HardBreak's setHardBreak falls
      // back to exitCode inside a code node, which drops the cursor into a
      // fresh paragraph after the block — a handy way out, and no longer the
      // shortcut anything here advertises.
      'Shift-Enter': ({ editor }: any) => editor.isActive('codeBlock') && editor.commands.newlineInCode(),
      Enter: ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false;
        const { $from, empty } = editor.state.selection;
        // Escape hatch. Overriding Enter drops the extension's own
        // exit-on-triple-Enter handler, so without this an empty code block
        // at the end of the doc is a trap: every Enter just makes another
        // empty code block and there's no keyboard way back out.
        if (empty && $from.parent.content.size === 0) {
          return editor.chain().focus().toggleCodeBlock().run();
        }
        // splitBlock alone gives the second half the position's *default*
        // type (a paragraph) when the cursor sits at the end of the block —
        // setNode puts it back to a code block, carrying the language across.
        // Mid-block splits already keep the type, so setNode is a no-op there.
        return editor.chain().splitBlock().setNode('codeBlock', editor.getAttributes('codeBlock')).run();
      },
    };
  },
}).configure({ lowlight });

// Wraps everything the selection touches in ONE code block, instead of
// Tiptap's toggleCodeBlock, which is a setBlockType over the range and so
// converts each paragraph/list item it covers into a code block of its own
// (three selected lines → three separate <pre> boxes). Both are wanted —
// see the Alt-click branch on the toolbar button — this is just the default.
//
// It replaces whole top-level blocks rather than the raw selection range:
// starting the replacement mid-list would leave the list structure cut in
// half. Block boundaries and leaf nodes (hard breaks) collapse into
// newlines, so a paragraph broken up with Shift-Enter survives the
// conversion — plain toggleCodeBlock drops those break nodes, since
// code_block's content spec has no room for them.
function setMergedCodeBlock(editor: any) {
  const { state } = editor;
  const { $from, $to, empty } = state.selection;
  if (empty || editor.isActive('codeBlock')) {
    editor.chain().focus().toggleCodeBlock().run();
    return;
  }
  const from = $from.depth > 0 ? $from.before(1) : $from.pos;
  const to = $to.depth > 0 ? $to.after(1) : $to.pos;
  const text = state.doc.textBetween(from, to, '\n', '\n');
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, { type: 'codeBlock', content: text ? [{ type: 'text', text }] : undefined })
    .run();
}

// onClick gets the event so a button can branch on a modifier key (the code
// block one does — Alt picks per-line instead of one merged block).
function ToolbarButton({ active, onClick, children, label }: { active?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      // Without this, the button's mousedown steals focus/collapses the
      // editor's text selection *before* onClick runs — so toggling e.g. a
      // heading or bold on a selection silently no-ops (or applies at the
      // wrong position) because by the time .focus() runs in the chain,
      // there's nothing selected anymore. Standard Tiptap toolbar pitfall.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded font-geist font-semibold cursor-pointer flex items-center justify-center"
      style={{
        minWidth: 28, height: 26, padding: '0 6px', fontSize: 12,
        background: active ? `${ACCENT}25` : 'rgba(197, 198, 199, 0.08)',
        color: active ? ACCENT : TEXT_MUTED,
      }}
    >
      {children}
    </button>
  );
}

interface Props {
  content: any; // parsed Tiptap doc — see utils/richContent.ts
  editable: boolean;
  onChangeJSON?: (json: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ content, editable, onChangeJSON, placeholder = 'Начни писать...' }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }), // replaced by our CodeBlock above
      CodeBlock,
      Image,
      Placeholder.configure({ placeholder }),
      // Toggle list ("▸ Список-тоггл" in the toolbar) — Notion calls this a
      // "toggle list"; Tiptap models it as a <details>/<summary> triple.
      // persist: true so a collapsed/expanded state survives a save+reload
      // instead of always reopening (the extension's default).
      Details.configure({ persist: true }),
      DetailsSummary,
      DetailsContent,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChangeJSON?.(JSON.stringify(editor.getJSON())),
  });

  // Read-only viewer instances get fresh content each time a different
  // record is opened — useEditor only applies `content` on first mount, so
  // switching guides/courses/etc. without this would keep showing the
  // previous one.
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content]);

  const insertImage = (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Картинка слишком большая (макс 2 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor?.chain().focus().setImage({ src: reader.result }).run();
      }
    };
    reader.readAsDataURL(file);
  };

  if (!editor) return null;

  return (
    <div>
      {editable && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 rounded-lg" style={{ background: 'rgba(197, 198, 199, 0.05)' }}>
          <ToolbarButton label="Заголовок 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton label="Заголовок 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton label="Абзац" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>¶</ToolbarButton>
          <ToolbarButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
          <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
          <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Icon name="memo" size={14} color="currentColor" /></ToolbarButton>
          {/* Alt-click keeps the old per-line behaviour (one code block per
              selected line); a plain click merges the whole selection into a
              single block, which is what people actually mean when they
              paste a snippet in and hit this. */}
          <ToolbarButton
            label="Блок кода — весь выделенный текст одним блоком (Alt — по блоку на строку)"
            active={editor.isActive('codeBlock')}
            onClick={e => (e.altKey ? editor.chain().focus().toggleCodeBlock().run() : setMergedCodeBlock(editor))}
          >{'</>'}</ToolbarButton>
          <ToolbarButton label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton label="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
          <ToolbarButton label="Список-тоггл" active={editor.isActive('details')} onClick={() => editor.chain().focus().setDetails().run()}>▸</ToolbarButton>
          <ToolbarButton label="Вставить картинку" onClick={() => fileInputRef.current?.click()}><Icon name="camera" size={14} color="currentColor" /></ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }}
          />
        </div>
      )}

      {/* The Enter/Shift-Enter split is the one rule here that isn't visible
          in the toolbar, so it gets a line of its own rather than living only
          in a tooltip nobody hovers. */}
      {editable && (
        <div className="mb-2 font-geist" style={{ fontSize: 11, color: 'rgba(197, 198, 199, 0.45)' }}>
          Enter — новый блок · Shift+Enter — новая строка в текущем блоке
        </div>
      )}

      {editable && editor && (
        <BubbleMenu editor={editor} options={{ placement: 'top' }}>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: CARD_BG, border: `1px solid ${ACCENT}55`, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
            <ToolbarButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
            <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
            <ToolbarButton label="Заголовок 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
            <ToolbarButton label="Заголовок 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
            <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Icon name="memo" size={14} color="currentColor" /></ToolbarButton>
            <ToolbarButton label="Код" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>{'<>'}</ToolbarButton>
          </div>
        </BubbleMenu>
      )}

      <div
        className={editable ? 'rich-text-content pixel-input' : 'rich-text-content'}
        // The extra left padding in edit mode is only there to keep the drag
        // handle off the text — 22px is the handle's own 18px plus a hair,
        // where the old 34px read as a stray indent on every line.
        style={editable ? { minHeight: 240, padding: '10px 12px 10px 22px' } : undefined}
      >
        {/* Drag-to-reorder handle — edit mode only, floats next to whatever
            block the cursor is over. Read-only instances render the same
            document without it since there's nothing to reorder there. */}
        {editable && (
          <DragHandle editor={editor}>
            <div className="rich-text-drag-handle" aria-label="Перетащить блок" title="Перетащить блок">⠿</div>
          </DragHandle>
        )}
        <EditorContent editor={editor} />
      </div>
      {/* All styling for .rich-text-content/.rich-text-drag-handle lives in
          index.css (global, not inline here) — see the comment at the top
          of that section for why: this component mounts several times per
          page in some places (CourseBuilderPage renders 3 at once), and an
          inline per-instance <style> tag using the same selectors meant
          whichever instance rendered last in the DOM won the cascade for
          all of them, e.g. every editor showing the same placeholder text. */}
    </div>
  );
}