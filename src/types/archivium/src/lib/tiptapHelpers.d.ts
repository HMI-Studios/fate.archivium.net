export interface OffsetTextNode {
  type: string;
  start?: number;
  end?: number;
  marks?: any[];
  content?: OffsetTextNode[];
  attrs?: { [key: string]: any };
}

export interface IndexedDocument {
  text: string;
  structure: OffsetTextNode[];
}

export function jsonToIndexed(doc: any): IndexedDocument;
export function indexedToJson(indexed: IndexedDocument, linkHandler?: (href: string) => void, headingHandler?: (text: string, level: number) => void): any;
