'use client';

import { useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface QuoteSearchInputProps {
  id: string;
  quotes: { id: string; label: string; searchText: string }[];
  value: string;
  onValueChange: (value: string) => void;
}

export function QuoteSearchInput({ id, quotes, value, onValueChange }: QuoteSearchInputProps) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const terms = search.trim().toLocaleLowerCase('nl').split(/\s+/).filter(Boolean);
  const options = [
    ...(!terms.length ? [{ id: '', label: 'Niet gekoppeld' }] : []),
    ...quotes.filter((quote) => terms.every((term) => quote.searchText.toLocaleLowerCase('nl').includes(term))),
  ];
  const selectedLabel = quotes.find((quote) => quote.id === value)?.label || '';

  const select = (quoteId: string) => {
    onValueChange(quoteId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={open ? search : selectedLabel}
        title={selectedLabel || 'Niet gekoppeld'}
        placeholder="Zoek op klant, offertenummer of titel..."
        onFocus={() => {
          setSearch('');
          setActiveIndex(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            const next = open
              ? Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)))
              : 0;
            setActiveIndex(next);
            listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (options[activeIndex]) select(options[activeIndex].id);
          }
        }}
      />
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Offertes"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((quote, index) => (
            <button
              key={quote.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={value === quote.id}
              tabIndex={-1}
              className={cn(
                'block w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                index === activeIndex && 'bg-accent text-accent-foreground',
                value === quote.id && 'font-medium'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(quote.id)}
            >
              {quote.label}
            </button>
          ))}
          {!options.length && <p role="status" className="px-2 py-3 text-sm text-muted-foreground">Geen offertes gevonden.</p>}
        </div>
      )}
    </div>
  );
}
