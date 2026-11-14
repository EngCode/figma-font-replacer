import type {
  DocumentInfo,
  FontRef,
  PluginSettings,
  ScanScope,
  TextStyleInfo,
} from '../../shared/contracts';
import { DEFAULT_SETTINGS } from '../../shared/contracts';
import { makeFontKey, uniqueFonts } from '../../shared/fontKey';
import { GatewayError, type FontGateway, type NotifyOptions, type TextNodeRead, type TextNodeRef } from './types';

export type FakeNodeType = 'FRAME' | 'GROUP' | 'COMPONENT' | 'INSTANCE' | 'PAGE' | 'TEXT';

export interface FakeTextSpec {
  characters?: string;
  /** One entry = single-font node, several = mixed node. */
  fonts: FontRef[];
  textStyleId?: string | null;
  locked?: boolean;
  visible?: boolean;
}

export interface FakeNodeSpec {
  id: string;
  name: string;
  type: FakeNodeType;
  children?: FakeNodeSpec[];
  text?: FakeTextSpec;
}

export interface FakeGatewayOptions {
  tree: FakeNodeSpec;
  availableFonts?: FontRef[];
  selectionIds?: string[];
  documentName?: string;
  pageName?: string;
  pageId?: string;
  textStyles?: TextStyleInfo[];
  settings?: PluginSettings | null;
}

export interface FakeWrite {
  kind: 'font' | 'range';
  nodeId: string;
  font: FontRef;
  start?: number;
  end?: number;
}

/**
 * In-memory gateway used by tests and by the browser UI harness.
 * Mirrors Figma semantics closely enough to exercise every service.
 */
export class FakeGateway implements FontGateway {
  readonly writes: FakeWrite[] = [];
  readonly loadedFonts: FontRef[] = [];
  readonly notifications: Array<{ message: string; error: boolean }> = [];
  readonly undoLabels: string[] = [];
  readonly resizes: Array<{ width: number; height: number }> = [];
  selectedIds: string[];
  settings: PluginSettings | null;

  private readonly tree: FakeNodeSpec;
  private readonly available: FontRef[];
  private readonly documentName: string;
  private readonly pageName: string;
  private readonly pageId: string;
  private readonly styles: TextStyleInfo[];

  constructor(options: FakeGatewayOptions) {
    // Deep-copy the spec: gateways mutate their own tree, callers reuse fixtures.
    this.tree = JSON.parse(JSON.stringify(options.tree)) as FakeNodeSpec;
    this.available = uniqueFonts(options.availableFonts ?? []);
    this.selectedIds = [...(options.selectionIds ?? [])];
    this.documentName = options.documentName ?? 'Fake document';
    this.pageName = options.pageName ?? 'Page 1';
    this.pageId = options.pageId ?? 'page-1';
    this.styles = options.textStyles ?? [];
    this.settings = options.settings ?? null;
  }

  async getDocumentInfo(): Promise<DocumentInfo> {
    return {
      documentName: this.documentName,
      pageName: this.pageName,
      pageId: this.pageId,
      selectionCount: this.selectedIds.length,
      textNodeCount: this.collectText(this.tree).length,
    };
  }

  async listAvailableFonts(): Promise<FontRef[]> {
    return [...this.available];
  }

  async loadFont(font: FontRef): Promise<void> {
    const key = makeFontKey(font);
    if (!this.available.some((candidate) => makeFontKey(candidate) === key)) {
      throw new GatewayError('font-not-found', `Font "${font.family} ${font.style}" is not available.`);
    }
    if (!this.loadedFonts.some((candidate) => makeFontKey(candidate) === key)) {
      this.loadedFonts.push(font);
    }
  }

  async listTextNodeIds(scope: ScanScope): Promise<TextNodeRef[]> {
    if (scope === 'selection') {
      const roots = this.selectedIds
        .map((id) => this.findById(this.tree, id))
        .filter((node): node is FakeNodeSpec => node !== null);
      return roots.flatMap((node) => this.collectText(node)).map((node) => ({ id: node.id, name: node.name }));
    }
    return this.collectText(this.tree).map((node) => ({ id: node.id, name: node.name }));
  }

  async readNode(nodeId: string): Promise<TextNodeRead | null> {
    const found = this.locate(this.tree, nodeId, false);
    if (!found || found.node.type !== 'TEXT') return null;
    const { node, instanceAncestor } = found;
    const spec = node.text;
    if (!spec) return null;
    const characters = spec.characters ?? '';
    return {
      id: node.id,
      name: node.name,
      characters,
      fonts: uniqueFonts(spec.fonts),
      textStyleId: spec.textStyleId ?? null,
      isInstanceText: instanceAncestor,
      visible: spec.visible ?? true,
      locked: spec.locked ?? false,
    };
  }

  async setNodeFont(nodeId: string, font: FontRef): Promise<void> {
    const found = this.locate(this.tree, nodeId, false);
    if (!found || found.node.type !== 'TEXT' || !found.node.text) {
      throw new GatewayError('node-deleted', `Text node "${nodeId}" no longer exists.`);
    }
    if (found.node.text.locked) {
      throw new GatewayError('node-locked', `Text node "${found.node.name}" is locked.`);
    }
    found.node.text.fonts = [font];
    this.writes.push({ kind: 'font', nodeId, font });
  }

  async setNodeRangeFont(nodeId: string, start: number, end: number, font: FontRef): Promise<void> {
    const found = this.locate(this.tree, nodeId, false);
    if (!found || found.node.type !== 'TEXT' || !found.node.text) {
      throw new GatewayError('node-deleted', `Text node "${nodeId}" no longer exists.`);
    }
    this.writes.push({ kind: 'range', nodeId, font, start, end });
  }

  async selectAndZoom(nodeId: string): Promise<void> {
    this.selectedIds = [nodeId];
  }

  async listTextStyles(): Promise<TextStyleInfo[]> {
    return [...this.styles];
  }

  notify(message: string, options?: NotifyOptions): void {
    this.notifications.push({ message, error: options?.error ?? false });
  }

  commitUndo(label: string): void {
    this.undoLabels.push(label);
  }

  async getSettings(): Promise<PluginSettings | null> {
    return this.settings ? { ...this.settings } : null;
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings };
  }

  resizeUi(width: number, height: number): void {
    this.resizes.push({ width, height });
  }

  /* -------------------------------------------------------------- */

  private collectText(node: FakeNodeSpec): FakeNodeSpec[] {
    const out: FakeNodeSpec[] = [];
    if (node.type === 'TEXT') out.push(node);
    for (const child of node.children ?? []) out.push(...this.collectText(child));
    return out;
  }

  private findById(node: FakeNodeSpec, id: string): FakeNodeSpec | null {
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const hit = this.findById(child, id);
      if (hit) return hit;
    }
    return null;
  }

  private locate(
    node: FakeNodeSpec,
    id: string,
    insideInstance: boolean,
  ): { node: FakeNodeSpec; instanceAncestor: boolean } | null {
    const nextInstance = insideInstance || node.type === 'INSTANCE';
    if (node.id === id) return { node, instanceAncestor: insideInstance };
    for (const child of node.children ?? []) {
      const hit = this.locate(child, id, nextInstance);
      if (hit) return hit;
    }
    return null;
  }
}

export function defaultSettings(): PluginSettings {
  return { ...DEFAULT_SETTINGS };
}
