import { useMemo } from 'react';
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

// Read-only renderer for the same Tiptap documents RichTextEditor produces.
//
// Reading is not editing, and it was costing everyone as though it were:
// RichTextEditor is a 699 KB chunk — Tiptap plus the whole of ProseMirror,
// larger than the rest of the application put together — and six places
// mounted it with editable={false} purely to display text. Opening a lesson,
// a guide, a bug example, a glossary term or a course description
// downloaded an editor to render static content nobody could type into.
//
// This walks the stored JSON and emits ordinary elements instead. It carries
// the same `.rich-text-content .tiptap` wrapper, so every rule in index.css
// applies unchanged and the two render identically — the styling was already
// written against the DOM shape Tiptap outputs, which is what this
// reproduces. Editing still loads the real editor; only reading stops paying
// for it.
//
// Syntax highlighting is kept: lowlight and nine grammars are a small
// fraction of what was being loaded, and losing colour in code samples on a
// site that teaches HTML/CSS/JS would be a real regression, not a trade.

const lowlight = createLowlight({
  javascript, typescript, xml, css, json, sql, bash, python, diff,
});

interface Node {
  type: string;
  attrs?: Record<string, any>;
  content?: Node[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
}

// lowlight returns a hast tree; this turns it into React elements. Only
// element/text nodes appear in it, and the className carries the hljs-*
// classes index.css already styles.
function hastToReact(node: any, key: number): React.ReactNode {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return null;
  const className = node.properties?.className;
  return (
    <span key={key} className={Array.isArray(className) ? className.join(' ') : className}>
      {(node.children || []).map((c: any, i: number) => hastToReact(c, i))}
    </span>
  );
}

function highlight(code: string, language?: string | null): React.ReactNode {
  // An unset or unregistered language renders as plain text rather than
  // throwing — a document can name any language its author typed.
  if (!language || !lowlight.registered(language)) return code;
  try {
    const tree = lowlight.highlight(language, code);
    return (tree.children || []).map((c: any, i: number) => hastToReact(c, i));
  } catch {
    return code;
  }
}

// Marks wrap inside-out, in the order Tiptap stores them.
function withMarks(text: string, marks: Node['marks'], key: number): React.ReactNode {
  let out: React.ReactNode = text;
  for (const mark of marks || []) {
    switch (mark.type) {
      case 'bold':   out = <strong>{out}</strong>; break;
      case 'italic': out = <em>{out}</em>; break;
      case 'strike': out = <s>{out}</s>; break;
      case 'code':   out = <code>{out}</code>; break;
      case 'underline': out = <u>{out}</u>; break;
      // An unknown mark keeps its text. Dropping the text instead would
      // silently delete a sentence because of one unrecognised attribute.
      default: break;
    }
  }
  return <span key={key}>{out}</span>;
}

function renderNodes(nodes: Node[] | undefined): React.ReactNode {
  return (nodes || []).map((n, i) => renderNode(n, i));
}

function renderNode(node: Node, key: number): React.ReactNode {
  switch (node.type) {
    case 'text':
      return node.marks?.length ? withMarks(node.text || '', node.marks, key) : node.text;

    case 'paragraph':
      return <p key={key}>{renderNodes(node.content)}</p>;

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const Tag = `h${level}` as 'h1';
      return <Tag key={key}>{renderNodes(node.content)}</Tag>;
    }

    case 'bulletList':  return <ul key={key}>{renderNodes(node.content)}</ul>;
    case 'orderedList': return <ol key={key} start={node.attrs?.start ?? 1}>{renderNodes(node.content)}</ol>;
    case 'listItem':    return <li key={key}>{renderNodes(node.content)}</li>;
    case 'blockquote':  return <blockquote key={key}>{renderNodes(node.content)}</blockquote>;
    case 'horizontalRule': return <hr key={key} />;
    case 'hardBreak':   return <br key={key} />;

    case 'codeBlock': {
      const code = (node.content || []).map(c => c.text || '').join('');
      const language = node.attrs?.language || null;
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>{highlight(code, language)}</code>
        </pre>
      );
    }

    case 'image':
      return <img key={key} src={node.attrs?.src} alt={node.attrs?.alt || ''} title={node.attrs?.title || undefined} />;

    // The toggle list. Rendered as a real <details>, which collapses without
    // any script — the editor needs a button because ProseMirror owns the
    // click, but a reader does not. `open` follows what the author saved
    // (Details is configured with persist: true).
    case 'details':
      return (
        <details key={key} data-type="details" open={node.attrs?.open ?? false}>
          {renderNodes(node.content)}
        </details>
      );
    case 'detailsSummary':
      return <summary key={key}>{renderNodes(node.content)}</summary>;
    case 'detailsContent':
      return <div key={key} data-type="detailsContent">{renderNodes(node.content)}</div>;

    default:
      // Same reasoning as the unknown mark above: an unrecognised container
      // still renders whatever is inside it. A document from a newer editor
      // loses its formatting here, not its words.
      return node.content ? <div key={key}>{renderNodes(node.content)}</div> : null;
  }
}

interface Props {
  content: any;
}

export default function RichTextView({ content }: Props) {
  const rendered = useMemo(() => renderNodes(content?.content), [content]);
  return (
    <div className="rich-text-content">
      <div className="tiptap">{rendered}</div>
    </div>
  );
}
