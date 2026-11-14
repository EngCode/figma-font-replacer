import type {
  DocumentInfo,
  FontRef,
  PluginSettings,
  ScanScope,
  TextStyleInfo,
} from '../../shared/contracts';

/** Minimal per-node read model. Missing-font detection happens in the service layer. */
export interface TextNodeRead {
  id: string;
  name: string;
  characters: string;
  /** Distinct fonts used across the node (more than one => mixed). */
  fonts: FontRef[];
  textStyleId: string | null;
  isInstanceText: boolean;
  visible: boolean;
  locked: boolean;
}

export interface TextNodeRef {
  id: string;
  name: string;
}

export interface NotifyOptions {
  error?: boolean;
  timeout?: number;
}

/**
 * The only seam through which services may touch Figma.
 *
 * Rule: `figma.*` is referenced exclusively by gateway implementations.
 * Every service, planner and UI component depends on this interface instead,
 * which keeps them unit-testable in plain Node.
 */
export interface FontGateway {
  getDocumentInfo(): Promise<DocumentInfo>;
  listAvailableFonts(): Promise<FontRef[]>;
  loadFont(font: FontRef): Promise<void>;

  listTextNodeIds(scope: ScanScope): Promise<TextNodeRef[]>;
  readNode(nodeId: string): Promise<TextNodeRead | null>;
  setNodeFont(nodeId: string, font: FontRef): Promise<void>;
  setNodeRangeFont(nodeId: string, start: number, end: number, font: FontRef): Promise<void>;
  selectAndZoom(nodeId: string): Promise<void>;

  listTextStyles(): Promise<TextStyleInfo[]>;

  notify(message: string, options?: NotifyOptions): void;
  /** Groups all mutations performed since the last call into one undo step. */
  commitUndo(label: string): void;

  getSettings(): Promise<PluginSettings | null>;
  saveSettings(settings: PluginSettings): Promise<void>;
  resizeUi(width: number, height: number): void;
}

/** Thrown by gateway implementations; carries a contract error code. */
export class GatewayError extends Error {
  readonly code:
    | 'font-not-found'
    | 'font-load-failed'
    | 'node-locked'
    | 'node-deleted'
    | 'instance-text'
    | 'internal';

  constructor(code: GatewayError['code'], message: string) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}
