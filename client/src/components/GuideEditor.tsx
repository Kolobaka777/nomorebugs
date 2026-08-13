import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { CARD_BG, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../utils/theme';

// Same trade-off as user_profiles.custom_avatar (server/src/routes/profile.js)
// — images live as base64 data URIs directly inside the document rather
// than a separate file-upload endpoint, since none exists in this app.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
  content: any; // parsed Tiptap doc — see parseGuideContent
  editable: boolean;
  onChangeJSON?: (json: string) => void;
}

export default function GuideEditor({ content, editable, onChangeJSON }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image, Placeholder.configure({ placeholder: 'Начни писать...' })],
    content,
    editable,
    onUpdate: ({ editor }) => onChangeJSON?.(JSON.stringify(editor.getJSON())),
  });

  // Read-only viewer instances get fresh content each time a different
  // guide is opened — useEditor only applies `content` on first mount, so
  // switching guides without this would keep showing the previous one.
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
        className={editable ? 'guide-editor-content pixel-input' : 'guide-editor-content'}
        style={editable ? { minHeight: 240, padding: '10px 12px' } : undefined}
      >
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .guide-editor-content .tiptap { color: ${TEXT_PRIMARY}; font-family: inherit; font-size: 14px; line-height: 1.7; outline: none; }
        .guide-editor-content .tiptap p { margin: 0.5em 0; }
        .guide-editor-content .tiptap h1 { font-size: 20px; font-weight: 700; margin: 0.9em 0 0.4em; }
        .guide-editor-content .tiptap h2 { font-size: 16px; font-weight: 600; margin: 0.8em 0 0.4em; }
        .guide-editor-content .tiptap blockquote { border-left: 3px solid ${ACCENT}; padding-left: 12px; margin: 0.6em 0; color: ${TEXT_MUTED}; }
        .guide-editor-content .tiptap pre { background: ${PAGE_BG}; padding: 12px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 13px; margin: 0.6em 0; }
        .guide-editor-content .tiptap code { background: rgba(197, 198, 199, 0.12); color: #EF9F27; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
        .guide-editor-content .tiptap pre code { background: none; color: inherit; padding: 0; }
        .guide-editor-content .tiptap ul, .guide-editor-content .tiptap ol { margin: 0.5em 0; padding-left: 1.4em; }
        .guide-editor-content .tiptap img { max-width: 100%; border-radius: 8px; margin: 0.6em 0; }
        .guide-editor-content .tiptap p.is-editor-empty:first-child::before {
          content: 'Начни писать...'; float: left; color: rgba(197, 198, 199, 0.4); pointer-events: none; height: 0;
        }
      `}</style>
    </div>
  );
}
