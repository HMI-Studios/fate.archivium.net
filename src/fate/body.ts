// Archivium's rich-text documents (item bodies and notes; archivium
// src/lib/tiptapHelpers.ts IndexedDocument), which this app edits as plain text.

export type BodyNode = { type: string, start?: number, end?: number, marks?: unknown[], attrs?: Record<string, unknown>, content?: BodyNode[] };
export type Body = { text: string, structure: BodyNode[] };

// A body made of plain paragraphs, one per line.
export function bodyFromText(text: string): Body {
  let body = '';
  const structure: BodyNode[] = text.split('\n').map(line => {
    if (!line) return { type: 'paragraph', attrs: { textAlign: 'left' }, marks: [], content: [] };
    const start = body.length;
    body += `${line}\n`;
    return {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      marks: [],
      content: [{ type: 'text', start, end: start + line.length, attrs: {}, marks: [] }],
    };
  });
  return { text: body, structure };
}

// False when the body has formatting that editing it as plain text would lose.
export function isPlainBody(body: Body): boolean {
  return body.structure.every(node => node.type === 'paragraph'
    && !node.marks?.length
    && (node.content ?? []).every(child => child.type === 'text' && !child.marks?.length));
}

// The body's text, one paragraph per line (Archivium doesn't record empty paragraphs
// in the text, so they're rebuilt from the structure).
export function textFromBody(body: Body): string {
  return body.structure.map(node => (node.content ?? []).map(child => body.text.slice(child.start ?? 0, child.end ?? 0)).join('')).join('\n');
}

export function asBody(value: unknown): Body | null {
  const body = value && typeof value === 'object' ? value as Body : null;
  if (!body || typeof body.text !== 'string' || !Array.isArray(body.structure)) return null;
  return body;
}

// A readable plain-text version of any body (formatting dropped; lists, quotes and
// the like kept as text), for places that only show plain text, like Archivium's
// sheet view. For bodies of plain paragraphs, it's the same as textFromBody.
export function plainTextOf(body: Body): string {
  const inline = (node: BodyNode): string => {
    if (node.type === 'text') return body.text.slice(node.start ?? 0, node.end ?? 0);
    if (node.type === 'hardBreak') return '\n';
    return (node.content ?? []).map(inline).join('');
  };
  const indent = (text: string, first: string, rest: string) =>
    text.split('\n').map((line, i) => (i === 0 ? first : rest) + line).join('\n');
  const block = (node: BodyNode): string => {
    const children = node.content ?? [];
    switch (node.type) {
      case 'bulletList':
        return children.map(item => indent(blocks(item.content ?? []), '• ', '  ')).join('\n');
      case 'orderedList': {
        const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
        return children.map((item, i) => {
          const marker = `${start + i}. `;
          return indent(blocks(item.content ?? []), marker, ' '.repeat(marker.length));
        }).join('\n');
      }
      case 'blockquote':
      case 'aside':
        return indent(blocks(children), '> ', '> ');
      case 'horizontalRule':
        return '---';
      case 'paragraph':
      case 'heading':
      case 'codeBlock':
        return inline(node);
      default:
        return children.length ? blocks(children) : inline(node);
    }
  };
  const blocks = (nodes: BodyNode[]): string => nodes.map(block).join('\n');
  return blocks(body.structure);
}

// Whether two bodies hold the same thing, however they were stored (the database may
// reorder keys, and plain text has several equivalent shapes).
export function sameBody(a: Body, b: Body): boolean {
  if (isPlainBody(a) && isPlainBody(b)) return textFromBody(a) === textFromBody(b);
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
