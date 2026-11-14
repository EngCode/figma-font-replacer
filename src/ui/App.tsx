import { useCallback, useEffect, useState } from 'react';
import type {
  ApplySummary,
  DocumentInfo,
  FontRef,
  Mapping,
  PluginError,
  PluginSettings,
  ReplacementPlan,
  ScanScope,
  ScanSummary,
  TextStyleInfo,
} from '../shared/contracts';
import type { PluginResponse, UiRequest } from '../shared/messages';
import type { UiTransport } from './transport';
import { Tabs, type TabDef } from './components/Tabs';
import { StatusHeader } from './components/StatusHeader';
import { Banner, Panel } from './components/Panel';
import { InventoryTable } from './components/InventoryTable';
import { ReplacePanel } from './components/ReplacePanel';

interface Session {
  info: DocumentInfo;
  fonts: FontRef[];
  styles: TextStyleInfo[];
  settings: PluginSettings;
}

type TabId = 'inventory' | 'replace' | 'report' | 'settings';

const TABS: TabDef[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'replace', label: 'Replace' },
  { id: 'report', label: 'Report' },
  { id: 'settings', label: 'Settings' },
];

export interface AppProps {
  transport: UiTransport;
}

export function App({ transport }: AppProps): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('inventory');
  const [error, setError] = useState<PluginError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [plan, setPlan] = useState<ReplacementPlan | null>(null);
  const [applyResult, setApplyResult] = useState<ApplySummary | null>(null);

  useEffect(() => {
    const unsubscribe = transport.subscribe((response: PluginResponse) => {
      switch (response.type) {
        case 'ready':
          setSession({
            info: response.info,
            fonts: response.fonts,
            styles: response.styles,
            settings: response.settings,
          });
          break;
        case 'settingsResult':
          setSession((current) => (current ? { ...current, settings: response.settings } : current));
          break;
        case 'scanResult':
          setScan(response.summary);
          setBusy(false);
          break;
        case 'planResult':
          setPlan(response.plan);
          setApplyResult(null);
          setBusy(false);
          break;
        case 'applyResult':
          setApplyResult(response.summary);
          setBusy(false);
          break;
        case 'scanProgress':
          setBusy(response.progress.phase !== 'done');
          break;
        case 'notify':
          if (response.level === 'error') setError({ code: 'internal', message: response.message });
          else setNotice(response.message);
          break;
        case 'error':
          setError(response.error);
          setBusy(false);
          break;
        default:
          break;
      }
    });

    transport.send({ type: 'ready' });
    return unsubscribe;
  }, [transport]);

  const send = useCallback(
    (request: UiRequest) => {
      transport.send(request);
    },
    [transport],
  );

  const patchSettings = useCallback(
    (patch: Partial<PluginSettings>) => {
      setSession((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));
      send({ type: 'setSettings', settings: patch });
    },
    [send],
  );

  const scope: ScanScope = session?.settings.scope ?? 'selection';

  const onScopeChange = (next: ScanScope): void => {
    patchSettings({ scope: next });
    if (scan && scan.scope !== next) setScan(null);
    setPlan(null);
    setApplyResult(null);
  };

  const onRescan = (): void => {
    setError(null);
    setBusy(true);
    send({ type: 'scan', scope });
  };

  const onPlan = (mappings: Mapping[]): void => {
    setError(null);
    setBusy(true);
    setPlan(null);
    setApplyResult(null);
    send({ type: 'plan', mode: 'pairwise', scope, mappings });
  };

  const onApply = (next: ReplacementPlan): void => {
    setError(null);
    setBusy(true);
    send({ type: 'apply', plan: next, confirm: true });
  };

  const resetReplace = (): void => {
    setPlan(null);
    setApplyResult(null);
  };

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            Aa
          </span>
          <div>
            <h1 className="app__title">Font Swap</h1>
            <p className="app__subtitle">Audit and consolidate fonts — no network access.</p>
          </div>
        </div>
        <span className="app__version">v0.1</span>
      </header>

      {error ? (
        <Banner kind="error" onDismiss={() => setError(null)}>
          {error.message}
          {error.code === 'not-implemented' ? ' Scheduled in a later phase.' : null}
        </Banner>
      ) : null}
      {notice ? (
        <Banner kind="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Banner>
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

      <div className="app__body">
        {!session ? (
          <div className="loading" role="status">
            Reading document…
          </div>
        ) : null}

        {session && tab === 'inventory' ? (
          <>
            <StatusHeader
              info={session.info}
              scope={scope}
              scan={scan}
              busy={busy}
              onScopeChange={onScopeChange}
              onRescan={onRescan}
            />
            <Panel
              title="Font inventory"
              hint="Every font in scope with usage counts, mixed nodes and missing fonts."
            >
              {scan ? (
                <InventoryTable
                  summary={scan}
                  showMixed={session.settings.showMixed}
                  onLocate={(nodeId) => send({ type: 'locate', nodeId })}
                />
              ) : (
                <p className="placeholder">
                  Pick a scope and press Scan to list every font, its usage count and its risk signals.
                </p>
              )}
            </Panel>
          </>
        ) : null}

        {session && tab === 'replace' ? (
          <Panel
            title="Replace fonts"
            hint="Map source fonts to a target, preview the plan, then apply in one undoable step."
          >
            <ReplacePanel
              fonts={session.fonts}
              scan={scan}
              plan={plan}
              result={applyResult}
              busy={busy}
              onScan={onRescan}
              onPlan={onPlan}
              onApply={onApply}
              onReset={resetReplace}
            />
          </Panel>
        ) : null}

        {session && tab === 'report' ? (
          <Panel title="Audit report" hint="Copy or export a record of every planned and applied change.">
            <p className="placeholder">Report rendering and CSV export arrive in phase P5 (task P5-T2).</p>
          </Panel>
        ) : null}

        {session && tab === 'settings' ? (
          <Panel title="Settings" hint="Defaults persist per user via figma.clientStorage.">
            <div className="settingsGrid">
              <label className="field">
                <span className="field__label">Default scan scope</span>
                <select
                  className="field__input"
                  value={session.settings.scope}
                  onChange={(event) => onScopeChange(event.target.value as ScanScope)}
                >
                  <option value="selection">Selection</option>
                  <option value="page">Page</option>
                  <option value="file">File</option>
                </select>
              </label>

              <label className="field">
                <span className="field__label">Component instances</span>
                <select
                  className="field__input"
                  value={session.settings.instancePolicy}
                  onChange={(event) =>
                    patchSettings({ instancePolicy: event.target.value as PluginSettings['instancePolicy'] })
                  }
                >
                  <option value="skip">Skip instance text</option>
                  <option value="overrides-only">Overrides only</option>
                  <option value="all">Include all instance text</option>
                </select>
              </label>

              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={session.settings.showMixed}
                  onChange={(event) => patchSettings({ showMixed: event.target.checked })}
                />
                <span className="field__label">Show mixed-font nodes in inventory</span>
              </label>
            </div>
            <dl className="meta">
              <dt>Available fonts</dt>
              <dd>{session.fonts.length}</dd>
              <dt>Text styles</dt>
              <dd>{session.styles.length}</dd>
              <dt>Document</dt>
              <dd>{session.info.documentName}</dd>
            </dl>
          </Panel>
        ) : null}
      </div>

      <footer className="app__footer">
        Read-only until you press Apply. Every write is grouped into a single undo step.
      </footer>
    </main>
  );
}
