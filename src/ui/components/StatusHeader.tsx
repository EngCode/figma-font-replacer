import type { DocumentInfo, ScanScope, ScanSummary } from '../../shared/contracts';

export interface StatusHeaderProps {
  info: DocumentInfo;
  scope: ScanScope;
  scan: ScanSummary | null;
  busy: boolean;
  onScopeChange: (scope: ScanScope) => void;
  onRescan: () => void;
}

const SCOPES: Array<{ value: ScanScope; label: string }> = [
  { value: 'selection', label: 'Selection' },
  { value: 'page', label: 'Page' },
  { value: 'file', label: 'File' },
];

export function StatusHeader({
  info,
  scope,
  scan,
  busy,
  onScopeChange,
  onRescan,
}: StatusHeaderProps): JSX.Element {
  return (
    <section className="status" aria-label="Document status">
      <div className="status__titles">
        <h2 className="status__page">{info.pageName}</h2>
        <p className="status__file" title={info.documentName}>
          {info.documentName}
        </p>
      </div>

      <div className="status__stats">
        <span className="chip">{info.selectionCount} selected</span>
        <span className="chip">{info.textNodeCount} text nodes</span>
        <span className="chip">{scan ? `${scan.groups.length} fonts` : '— fonts'}</span>
        {scan && scan.mixedNodeCount > 0 ? (
          <span className="chip chip--warn">{scan.mixedNodeCount} mixed</span>
        ) : null}
        {scan && scan.missingFontKeys.length > 0 ? (
          <span className="chip chip--danger">{scan.missingFontKeys.length} missing</span>
        ) : null}
      </div>

      <div className="status__actions">
        <div className="segmented" role="group" aria-label="Scan scope">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`segmented__item${scope === option.value ? ' segmented__item--active' : ''}`}
              aria-pressed={scope === option.value}
              onClick={() => onScopeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="button button--primary" onClick={onRescan} disabled={busy}>
          {busy ? 'Scanning…' : 'Scan'}
        </button>
      </div>
    </section>
  );
}
