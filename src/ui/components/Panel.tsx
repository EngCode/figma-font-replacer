import type { ReactNode } from 'react';

export interface PanelProps {
  title: string;
  hint?: string;
  children?: ReactNode;
}

export function Panel({ title, hint, children }: PanelProps): JSX.Element {
  return (
    <section className="panel" aria-label={title}>
      <header className="panel__header">
        <h3 className="panel__title">{title}</h3>
        {hint ? <p className="panel__hint">{hint}</p> : null}
      </header>
      {children ? <div className="panel__body">{children}</div> : null}
    </section>
  );
}

export interface BannerProps {
  kind: 'error' | 'info' | 'success';
  children: ReactNode;
  onDismiss?: () => void;
}

export function Banner({ kind, children, onDismiss }: BannerProps): JSX.Element {
  return (
    <div className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="banner__text">{children}</span>
      {onDismiss ? (
        <button type="button" className="banner__dismiss" onClick={onDismiss} aria-label="Dismiss message">
          ×
        </button>
      ) : null}
    </div>
  );
}
