import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
// All three live in the one package in Tiptap v3 (the old 3-package split
// — extension-details-summary/-content as separate installs — never got a
// v3 release; @tiptap/extension-details now bundles them itself).
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { CARD_BG, TEXT_MUTED, ACCENT } from '../utils/theme';

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

// `common` covers the languages a QA tester actually pastes — JS/TS, JSON,
// HTML/XML, CSS, Python, bash/shell, SQL, Java, etc. — without pulling in
// highlight.js's full ~190-language grammar set into the bundle.
const lowlight = createLowlight(common);

function ToolbarButton({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
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
      StarterKit.configure({ codeBlock: false }), // replaced by CodeBlockLowlight below
      CodeBlockLowlight.configure({ lowlight }),
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
          <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolbarButton>
          <ToolbarButton label="Блок кода" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'</>'}</ToolbarButton>
          <ToolbarButton label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
          <ToolbarButton label="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
          <ToolbarButton label="Список-тоггл" active={editor.isActive('details')} onClick={() => editor.chain().focus().setDetails().run()}>▸</ToolbarButton>
          <ToolbarButton label="Вставить картинку" onClick={() => fileInputRef.current?.click()}>🖼</ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }}
          />
        </div>
      )}

      {editable && editor && (
        <BubbleMenu editor={editor} options={{ placement: 'top' }}>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: CARD_BG, border: `1px solid ${ACCENT}55`, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
            <ToolbarButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
            <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
            <ToolbarButton label="Заголовок 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
            <ToolbarButton label="Заголовок 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
            <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolbarButton>
            <ToolbarButton label="Код" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>{'<>'}</ToolbarButton>
          </div>
        </BubbleMenu>
      )}

      <div
        className={editable ? 'rich-text-content pixel-input' : 'rich-text-content'}
        style={editable ? { minHeight: 240, padding: editable ? '10px 12px 10px 34px' : '10px 12px' } : undefined}
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