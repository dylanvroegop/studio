
import React, { useState, useRef, useCallback } from 'react';

export interface DraggableOpening {
    id: string;
    fromLeft: number;
    fromBottom: number; // Using fromBottom as primary stored val? Or whatever the component uses.
    type: string;
    // We treat generic openings.
    [key: string]: any;
}

interface UseDraggableParams<T> {
    openings: T[];
    onOpeningsChange?: (newOpenings: T[]) => void;
    pxPerMm: number; // Current scale
    isMagnifier?: boolean;
}

export function useDraggableOpenings<T extends DraggableOpening>({
    openings,
    onOpeningsChange,
    pxPerMm,
    isMagnifier
}: UseDraggableParams<T>) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const dragStartRef = useRef<{
        x: number;
        y: number;
        opId: string;
        origLeft: number;
        origBottom: number;
    } | null>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent, op: T) => {
        if (isMagnifier) return;
        if (!onOpeningsChange) return;

        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);

        setDraggingId(op.id);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            opId: op.id,
            origLeft: op.fromLeft,
            origBottom: op.fromBottom
        };
    }, [isMagnifier, onOpeningsChange]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const start = dragStartRef.current;
        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = -(dyPx / pxPerMm); // Up is positive MM, Down is positive Pixels

        const newLeft = Math.round(start.origLeft + dxMm);
        let newBottom = Math.round(start.origBottom + dyMm);

        // Find the opening type for sticky logic
        const currentOp = openings.find(o => o.id === draggingId);
        if (currentOp) {
            // Sticky bottom Logic (Reference WallDrawing)
            if (currentOp.type === 'door' || currentOp.type === 'opening' || currentOp.type === 'schoorsteen') {
                if (Math.abs(newBottom) < 100) {
                    newBottom = 0;
                }
            }

            // Create updated array
            const updated = openings.map(o => {
                if (o.id === draggingId) {
                    return { ...o, fromLeft: newLeft, fromBottom: newBottom };
                }
                return o;
            });

            onOpeningsChange(updated);
        }

    }, [draggingId, onOpeningsChange, openings, pxPerMm]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (draggingId) {
            (e.target as Element).releasePointerCapture(e.pointerId);
            setDraggingId(null);
            dragStartRef.current = null;
        }
    }, [draggingId]);

    return {
        draggingId,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp
    };
}
