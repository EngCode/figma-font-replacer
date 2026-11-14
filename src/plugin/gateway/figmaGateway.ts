import type {
  DocumentInfo,
  FontRef,
  PluginSettings,
  ScanScope,
  TextStyleInfo,
} from '../../shared/contracts';
import { SETTINGS_KEY } from '../../shared/contracts';
import { makeFontKey, uniqueFonts } from '../../shared/fontKey';
import { isPluginSettings } from '../../shared/messages';
import { GatewayError, type FontGateway, type NotifyOptions, type TextNodeRead, type TextNodeRef } from './types';

const isTextNode = (node: BaseNode | null): node is TextNode => node !== null && node.type === 'TEXT';

function hasChildren(node: BaseNode): node is BaseNode & ChildrenMixin {
  return 'children' in node;
}

function toFontRef(font: FontName): FontRef {
  return { family: font.family, style: font.style };
}

/**
 * Real Figma implementation of {@link FontGateway}.
 * This is the only file allowed to reference `figma.*` for document data.
 */
export class FigmaGateway implements FontGateway {
  private readonly loaded = new Set<string>();
  private readonly loading = new Map<string, Promise<void>>();

  async getDocumentInfo(): Promise<DocumentInfo> {
    const page = figma.currentPage;
    const textNodeCount = page.findAll((node) => node.type === 'TEXT').length;
    return {
      documentName: figma.root.name,
      pageName: page.name,
      pageId: page.id,
      selectionCount: page.selection.length,
      textNodeCount,
    };
  }

  async listAvailableFonts(): Promise<FontRef[]> {
    const fonts = await figma.listAvailableFontsAsync();
    return uniqueFonts(fonts.map((entry) => toFontRef(entry.fontName)));
  }

  async loadFont(font: FontRef): Promise<void> {
    const key = makeFontKey(font);
    if (this.loaded.has(key)) return;
    const inFlight = this.loading.get(key);
    if (inFlight) return inFlight;

    const task = figma
      .loadFontAsync({ family: font.family, style: font.style })
      .then(() => {
        this.loaded.add(key);
      })
      .catch((error: unknown) => {
        throw new GatewayError(
          'font-load-failed',
          `Could not load "${font.family} ${font.style}": ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      })
      .finally(() => {
        this.loading.delete(key);
      });

    this.loading.set(key, task);
    return task;
  }

  async listTextNodeIds(scope: ScanScope): Promise<TextNodeRef[]> {
    const refs: TextNodeRef[] = [];
    const push = (node: TextNode): void => {
      refs.push({ id: node.id, name: node.name });
    };

    if (scope === 'selection') {
      for (const node of figma.currentPage.selection) {
        if (isTextNode(node)) push(node);
        if (hasChildren(node)) {
          for (const child of node.findAll((candidate) => candidate.type === 'TEXT')) {
            if (isTextNode(child)) push(child);
          }
        }
      }
      return refs;
    }

    if (scope === 'page') {
      for (const node of figma.currentPage.findAll((candidate) => candidate.type === 'TEXT')) {
        if (isTextNode(node)) push(node);
      }
      return refs;
    }

    for (const page of figma.root.children) {
      await page.loadAsync();
      for (const node of page.findAll((candidate) => candidate.type === 'TEXT')) {
        if (isTextNode(node)) push(node);
      }
    }
    return refs;
  }

  async readNode(nodeId: string): Promise<TextNodeRead | null> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!isTextNode(node)) return null;

    let fonts: FontRef[] = [];
    if (node.characters.length > 0) {
      fonts = uniqueFonts(node.getRangeAllFontNames(0, node.characters.length).map(toFontRef));
    } else if (node.fontName !== figma.mixed) {
      fonts = [toFontRef(node.fontName)];
    }

    let isInstanceText = false;
    let parent: BaseNode | null = node.parent;
    while (parent) {
      if (parent.type === 'INSTANCE') {
        isInstanceText = true;
        break;
      }
      parent = parent.parent;
    }

    return {
      id: node.id,
      name: node.name,
      characters: node.characters,
      fonts,
      textStyleId: node.textStyleId === figma.mixed ? null : node.textStyleId,
      isInstanceText,
      visible: node.visible,
      locked: node.locked,
    };
  }

  async setNodeFont(nodeId: string, font: FontRef): Promise<void> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!isTextNode(node)) throw new GatewayError('node-deleted', `Text node "${nodeId}" no longer exists.`);
    if (node.locked) throw new GatewayError('node-locked', `Text node "${node.name}" is locked.`);
    node.fontName = { family: font.family, style: font.style };
  }

  async setNodeRangeFont(nodeId: string, start: number, end: number, font: FontRef): Promise<void> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!isTextNode(node)) throw new GatewayError('node-deleted', `Text node "${nodeId}" no longer exists.`);
    if (node.locked) throw new GatewayError('node-locked', `Text node "${node.name}" is locked.`);
    node.setRangeFontName(start, end, { family: font.family, style: font.style });
  }

  async selectAndZoom(nodeId: string): Promise<void> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return;
    figma.currentPage.selection = [node as SceneNode];
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  }

  async listTextStyles(): Promise<TextStyleInfo[]> {
    const styles = await figma.getLocalTextStylesAsync();
    return styles.map((style) => ({
      id: style.id,
      name: style.name,
      font: toFontRef(style.fontName),
      remote: style.remote,
      isLibrary: style.remote,
    }));
  }

  notify(message: string, options?: NotifyOptions): void {
    figma.notify(message, { error: options?.error ?? false, timeout: options?.timeout });
  }

  commitUndo(_label: string): void {
    const api = figma as unknown as { commitUndo?: () => void };
    api.commitUndo?.();
  }

  async getSettings(): Promise<PluginSettings | null> {
    const stored: unknown = await figma.clientStorage.getAsync(SETTINGS_KEY);
    return isPluginSettings(stored) ? stored : null;
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
  }

  resizeUi(width: number, height: number): void {
    figma.ui.resize(width, height);
  }
}
