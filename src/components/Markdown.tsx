import { Fragment, type CSSProperties, type ReactNode } from 'react';

/**
 * A tiny, safe markdown renderer for speech bodies.
 * Supports: ## / ### headings, - bullets, 1. ordered lists, > quotes,
 * --- rules, **bold**, *italic* and `code`. Nothing is ever injected as
 * raw HTML, so imported content can't break the app.
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

function renderInline(text: string): ReactNode[] {
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
    return <Fragment key={index}>{part}</Fragment>;
  });
}

interface MarkdownProps {
  text: string;
  className?: string;
  style?: CSSProperties;
}

export function Markdown({ text, className, style }: MarkdownProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={className} style={style}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={index}>{renderInline(block.text)}</h2>
            ) : (
              <h3 key={index}>{renderInline(block.text)}</h3>
            );
          case 'quote':
            return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
          case 'bullets':
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'ordered':
            return (
              <ol key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case 'rule':
            return <hr key={index} />;
          default:
            return <p key={index}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
