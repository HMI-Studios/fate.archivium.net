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
