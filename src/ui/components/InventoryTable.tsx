import { useMemo, useState } from 'react';
import type { ScanSummary } from '../../shared/contracts';

export interface InventoryTableProps {
  summary: ScanSummary;
  showMixed: boolean;
  onLocate: (nodeId: string) => void;
}

type SortMode = 'count' | 'name';

export function InventoryTable({ summary, showMixed, onLocate }: InventoryTableProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('count');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = summary.groups.filter((group) => {
      if (!showMixed && group.mixedNodeIds.length === group.count) return false;
      if (!needle) return true;
      return `${group.font.family} ${group.font.style}`.toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'name') {
        return `${a.font.family} ${a.font.style}`.localeCompare(`${b.font.family} ${b.font.style}`);
      }
      return b.count - a.count;
    });
  }, [summary.groups, query, sort, showMixed]);

  const missingGroups = summary.groups.filter((group) => group.missing);
  const missingNodeCount = new Set(missingGroups.flatMap((group) => group.nodeIds)).size;

  return (
    <div className="inventory">
      <div className="toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder="Filter by family or style…"
          aria-label="Filter fonts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="toolbar__meta">
          {summary.scannedTextNodes} text nodes · {summary.groups.length} fonts · {summary.durationMs} ms
          {summary.cancelled ? ' · scan cancelled' : ''}
        </span>
        <button
          type="button"
          className="button"
          onClick={() => setSort((current) => (current === 'count' ? 'name' : 'count'))}
        >
          Sort: {sort === 'count' ? 'usage' : 'name'}
        </button>
      </div>

      {missingGroups.length > 0 ? (
        <p className="inventory__note inventory__note--danger">
          {missingGroups.length} font{missingGroups.length === 1 ? '' : 's'} unavailable in this file affect{' '}
          {missingNodeCount} text node{missingNodeCount === 1 ? '' : 's'}. They are reported, not replaced yet.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="placeholder">
          {summary.scannedTextNodes === 0
            ? 'No text nodes in scope. Select something or switch the scope.'
            : 'No fonts match this filter.'}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Font</th>
              <th scope="col" className="table__num">
                Nodes
              </th>
              <th scope="col">Signals</th>
              <th scope="col" className="table__actions">
                <span className="visuallyHidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((group) => {
              const firstNode = group.nodeIds.at(0);
              return (
                <tr key={group.key} className={group.missing ? 'table__row--missing' : undefined}>
                  <td>
                    <span className="fontName">{group.font.family}</span>
                    <span className="fontStyle">{group.font.style}</span>
                  </td>
                  <td className="table__num">{group.count}</td>
                  <td>
                    <span className="badges">
                      {group.missing ? <span className="chip chip--danger">missing</span> : null}
                      {group.mixedNodeIds.length > 0 ? (
                        <span className="chip chip--warn" title={`${group.mixedNodeIds.length} mixed nodes`}>
                          mixed ×{group.mixedNodeIds.length}
                        </span>
                      ) : null}
                      {group.styleLinkedNodeIds.length > 0 ? (
                        <span className="chip" title="Linked to a text style">
                          style ×{group.styleLinkedNodeIds.length}
                        </span>
                      ) : null}
                      {group.instanceNodeIds.length > 0 ? (
                        <span className="chip" title="Inside component instances">
                          instance ×{group.instanceNodeIds.length}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="table__actions">
                    {firstNode ? (
                      <button type="button" className="linkButton" onClick={() => onLocate(firstNode)}>
                        Locate
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
