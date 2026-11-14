import { useRef } from 'react';

export interface TabDef {
  id: string;
  label: string;
  badge?: number;
}

export interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusTab = (id: string): void => {
    containerRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    focusTab(target.id);
  };

  return (
    <div className="tabs" role="tablist" aria-label="Font Swap sections" ref={containerRef} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`tabs__tab${selected ? ' tabs__tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 ? <span className="tabs__badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
