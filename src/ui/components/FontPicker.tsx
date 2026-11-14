import { useEffect, useMemo, useRef, useState } from 'react';
import type { FontRef } from '../../shared/contracts';
import { fontLabel, makeFontKey } from '../../shared/fontKey';

export interface FontPickerProps {
  fonts: FontRef[];
  value: FontRef | null;
  onChange: (font: FontRef | null) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const MAX_RESULTS = 60;

export function FontPicker({
  fonts,
  value,
  onChange,
  label,
  placeholder = 'Search fonts…',
  disabled = false,
  id,
}: FontPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? fonts.filter((font) => fontLabel(font).toLowerCase().includes(needle))
      : fonts;
    return filtered.slice(0, MAX_RESULTS);
  }, [fonts, query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (font: FontRef): void => {
    onChange(font);
    setQuery('');
    setOpen(false);
  };

  const commitActive = (): void => {
    const font = results[activeIndex];
    if (font) choose(font);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      commitActive();
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
  };

  const valueKey = value ? makeFontKey(value) : null;

  return (
    <div className="fontPicker">
      <label className="field">
        <span className="field__label">{label}</span>
        <input
          id={id}
          className="field__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={value ? fontLabel(value) : placeholder}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
        />
      </label>

      {value ? (
        <div className="fontPicker__value">
          <span className="fontPicker__name">{fontLabel(value)}</span>
          <button type="button" className="linkButton" onClick={() => onChange(null)} disabled={disabled}>
            Clear
          </button>
        </div>
      ) : null}

      {open ? (
        <ul className="fontPicker__list" role="listbox" id={id ? `${id}-listbox` : undefined} ref={listRef}>
          {results.length === 0 ? <li className="fontPicker__empty">No matching fonts</li> : null}
          {results.map((font, index) => {
            const key = makeFontKey(font);
            const isActive = index === activeIndex;
            const isSelected = key === valueKey;
            return (
              <li
                key={key}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                className={`fontPicker__option${isActive ? ' fontPicker__option--active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(font);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="fontPicker__optionFamily">{font.family}</span>
                <span className="fontPicker__optionStyle">{font.style}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
