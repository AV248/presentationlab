import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { isUncommon } from '../services/dictionary';

/**
 * A tiny, safe markdown renderer for speech bodies.
 * Supports: ## / ### headings, - bullets, 1. ordered lists, > quotes,
 * --- rules, **bold**, *italic* and `code`. Nothing is ever injected as
 * raw HTML, so imported content can't break the app.
 *
 * When `defineWords` is on, every uncommon word is wrapped in a button so
 * the reader can tap it for a meaning. The wrapping happens at render time
 * on plain text runs only — formatting, quotes and code are untouched.
 */

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'quote'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'ordered'; items: string[] }
  | { type: 'rule' }
  | { type: 'paragraph'; text: string };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushLists = () => {
    if (bullets.length) {
      blocks.push({ type: 'bullets', items: bullets });
      bullets = [];
    }
    if (ordered.length) {
      blocks.push({ type: 'ordered', items: ordered });
      ordered = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushLists();
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      flushParagraph();
      flushLists();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushLists();
      blocks.push({
        type: 'heading',
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2],
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (ordered.length) flushLists();
      bullets.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      if (bullets.length) flushLists();
      ordered.push(numbered[1]);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushLists();
      blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushLists();
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export type DefineHandler = (word: string, target: HTMLElement) => void;

/**
 * Split a run of plain text into words, wrapping the uncommon ones in a
 * button that opens the word lens. Everything else passes through as text,
 * so spacing and punctuation are preserved exactly.
 */
function withDefinitions(text: string, onDefine: DefineHandler, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /[A-Za-z][A-Za-z'’-]*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    const word = match[0];
    if (!isUncommon(word)) continue;
    if (match.index > cursor) {
      out.push(<Fragment key={`${keyPrefix}-t${index}`}>{text.slice(cursor, match.index)}</Fragment>);
    }
    out.push(
      <button
        key={`${keyPrefix}-w${index}`}
        type="button"
        className="pb-define"
        title={`What does “${word}” mean?`}
        onClick={(event) => {
          event.stopPropagation();
          onDefine(word, event.currentTarget);
        }}
      >
        {word}
      </button>,
    );
    cursor = match.index + word.length;
    index += 1;
  }

  if (cursor < text.length) {
    out.push(<Fragment key={`${keyPrefix}-tail`}>{text.slice(cursor)}</Fragment>);
  }
  return out.length ? out : [<Fragment key={`${keyPrefix}-all`}>{text}</Fragment>];
}

function renderInline(text: string, onDefine?: DefineHandler, keyPrefix = 'i'): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '');
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (onDefine) return <Fragment key={index}>{withDefinitions(part, onDefine, `${keyPrefix}-${index}`)}</Fragment>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

interface MarkdownProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Underline uncommon words and call this when one is tapped. */
  onDefine?: DefineHandler;
}

export function Markdown({ text, className, style, onDefine }: MarkdownProps) {
  const blocks = parseBlocks(text);
  const inline = (value: string, key: string) => renderInline(value, onDefine, key);
  return (
    <div className={className} style={style}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={index}>{inline(block.text, `h${index}`)}</h2>
            ) : (
              <h3 key={index}>{inline(block.text, `h${index}`)}</h3>
            );
          case 'quote':
            return <blockquote key={index}>{inline(block.text, `q${index}`)}</blockquote>;
          case 'bullets':
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{inline(item, `b${index}-${i}`)}</li>
                ))}
              </ul>
            );
          case 'ordered':
            return (
              <ol key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{inline(item, `o${index}-${i}`)}</li>
                ))}
              </ol>
            );
          case 'rule':
            return <hr key={index} />;
          default:
            return <p key={index}>{inline(block.text, `p${index}`)}</p>;
        }
      })}
    </div>
  );
}
