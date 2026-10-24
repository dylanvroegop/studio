'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import styles from './AutoHideQuoteHeader.module.css';

interface AutoHideQuoteHeaderProps {
    children: ReactNode;
    className?: string;
}

export function AutoHideQuoteHeader({ children, className }: AutoHideQuoteHeaderProps): JSX.Element {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            className={styles.container}
            data-expanded={expanded}
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setExpanded(false);
                    event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
                }
            }}
        >
            <button
                type="button"
                className={styles.trigger}
                aria-label="Offertebalk tonen"
                aria-expanded={expanded}
                onClick={() => setExpanded(true)}
            >
                <ChevronLeft size={14} />
            </button>
            <header className={`${className ?? ''} ${styles.panel}`}>
                {children}
            </header>
        </div>
    );
}
