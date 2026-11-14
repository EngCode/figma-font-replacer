import { useMemo, useState } from 'react';
import type {
  ApplySummary,
  FontKey,
  FontRef,
  Mapping,
  ReplacementPlan,
  ScanSummary,
} from '../../shared/contracts';
import { fontLabel, makeFontKey } from '../../shared/fontKey';
import { describeSkipReason } from '../../shared/planner';
import { FontPicker } from './FontPicker';

export interface ReplacePanelProps {
  fonts: FontRef[];
  scan: ScanSummary | null;
  plan: ReplacementPlan | null;
  result: ApplySummary | null;
  busy: boolean;
  onScan: () => void;
  onPlan: (mappings: Mapping[]) => void;
  onApply: (plan: ReplacementPlan) => void;
  onReset: () => void;
}

const MAX_PREVIEW_ROWS = 8;

export function ReplacePanel({
  fonts,
  scan,
  plan,
  result,
  busy,
  onScan,
  onPlan,
  onApply,
  onReset,
}: ReplacePanelProps): JSX.Element {
  const [targets, setTargets] = useState<Record<FontKey, FontKey>>({});
  const [consolidate, setConsolidate] = useState<FontRef | null>(null);

  const fontByKey = useMemo(() => {
    const map = new Map<FontKey, FontRef>();
    for (const font of fonts) map.set(makeFontKey(font), font);
    return map;
  }, [fonts]);

  const sources = useMemo(
    () => (scan ? scan.groups.filter((group) => group.count > 0) : []),
    [scan],
  );

  const mappings = useMemo<Mapping[]>(() => {
    const out: Mapping[] = [];
    for (const group of sources) {
      const targetKey = targets[group.key];
      const target = targetKey ? fontByKey.get(targetKey) : undefined;
      if (target) out.push({ fromKey: group.key, to: target });
    }
    return out;
  }, [sources, targets, fontByKey]);

  const setTargetForAll = (font: FontRef | null): void => {
    setConsolidate(font);
    if (!font) {
      setTargets({});
      return;
    }
    const key = makeFontKey(font);
    const next: Record<FontKey, FontKey> = {};
    for (const group of sources) next[group.key] = key;
    setTargets(next);
  };

  const skipCounts = useMemo(() => {
    if (!plan) return [] as Array<{ reason: string; count: number }>;
    const counts = new Map<string, number>();
    for (const entry of plan.entries) {
      if (entry.action !== 'skip') continue;
      const label = describeSkipReason(entry.reason);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
  }, [plan]);

  if (!scan) {
    return (
      <div className="replace">
        <p className="placeholder">
          Run a scan first: the inventory tells us which fonts exist and how many nodes each one touches.
        </p>
        <button type="button" className="button button--primary" onClick={onScan} disabled={busy}>
          {busy ? 'Scanning…' : 'Scan now'}
        </button>
      </div>
    );
  }

  return (
    <div className="replace">
      <div className="replace__bulk">
        <FontPicker
          id="consolidate-target"
          fonts={fonts}
          value={consolidate}
          onChange={setTargetForAll}
          label="Consolidate every font to"
          placeholder="Pick one target font…"
          disabled={sources.length === 0}
        />
      </div>

      <table className="table table--mapping">
        <thead>
          <tr>
            <th scope="col">Source font</th>
            <th scope="col" className="table__num">
              Nodes
            </th>
            <th scope="col">Target</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((group) => (
            <tr key={group.key} className={group.missing ? 'table__row--missing' : undefined}>
              <td>
                <span className="fontName">{group.font.family}</span>
                <span className="fontStyle">
                  {group.font.style}
                  {group.missing ? ' · unavailable' : ''}
                </span>
              </td>
              <td className="table__num">{group.count}</td>
              <td>
                <select
                  className="field__input"
                  aria-label={`Target font for ${fontLabel(group.font)}`}
                  value={targets[group.key] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTargets((current) => {
                      const next = { ...current };
                      if (value) next[group.key] = value;
                      else delete next[group.key];
                      return next;
                    });
                  }}
                >
                  <option value="">Keep as is</option>
                  {fonts.map((font) => (
                    <option key={makeFontKey(font)} value={makeFontKey(font)}>
                      {fontLabel(font)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="replace__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => onPlan(mappings)}
          disabled={busy || mappings.length === 0}
        >
          {busy ? 'Working…' : 'Preview plan'}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => plan && onApply(plan)}
          disabled={busy || !plan || plan.totals.replace === 0}
        >
          Apply {plan ? plan.totals.replace : 0} change{plan && plan.totals.replace === 1 ? '' : 's'}
        </button>
        {plan || result ? (
          <button type="button" className="linkButton" onClick={onReset}>
            Reset
          </button>
        ) : null}
        <span className="replace__hint">
          {mappings.length === 0 ? 'Choose at least one target font.' : `${mappings.length} source font(s) mapped.`}
        </span>
      </div>

      {plan ? (
        <section className="plan" aria-label="Plan preview">
          <h4 className="plan__title">
            Plan: {plan.totals.replace} to replace, {plan.totals.skip} to skip
          </h4>
          <ul className="plan__list">
            {plan.entries
              .filter((entry) => entry.action === 'replace')
              .slice(0, MAX_PREVIEW_ROWS)
              .map((entry) => (
                <li key={entry.nodeId} className="plan__item">
                  <span className="plan__node">{entry.nodeName}</span>
                  <span className="plan__change">
                    {entry.from.map(fontLabel).join(', ') || '—'} → {entry.to ? fontLabel(entry.to) : '—'}
                  </span>
                </li>
              ))}
          </ul>
          {plan.totals.replace > MAX_PREVIEW_ROWS ? (
            <p className="plan__more">+{plan.totals.replace - MAX_PREVIEW_ROWS} more…</p>
          ) : null}
          {skipCounts.length > 0 ? (
            <ul className="plan__skips">
              {skipCounts.map((item) => (
                <li key={item.reason}>
                  {item.reason}: {item.count}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className="result" aria-label="Apply result">
          <h4 className="result__title">
            {result.failed > 0 ? 'Applied with errors' : 'Applied'} — {result.changed} changed, {result.skipped} skipped,{' '}
            {result.failed} failed · {result.durationMs} ms
          </h4>
          {result.errors.length > 0 ? (
            <ul className="result__errors">
              {result.errors.map((error, index) => (
                <li key={`${error.nodeId ?? 'node'}-${index}`}>
                  <strong>{error.nodeName ?? error.nodeId ?? 'Node'}</strong>: {error.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="result__ok">Undo (⌘Z / Ctrl+Z) reverts the whole run in one step.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
