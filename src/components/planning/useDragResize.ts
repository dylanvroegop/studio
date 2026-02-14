import { useState, useEffect, useRef, useCallback } from 'react';
import { TimelineView, PlanningEntry } from '@/lib/types-planning';
import { addMinutes } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

interface DragState {
    entryId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    initialX: number;
    initialY: number;
    initialStart: Date;
    initialEnd: Date;
    currentX: number; // For ghost element or calculating delta
    currentY: number;
}

interface UseDragResizeProps {
    entries: PlanningEntry[];
    view: TimelineView;
    onEntryDrop: (entryId: string, newStart: Date, employeeId: string) => void;
    onEntryResize: (entryId: string, newStart: Date, newEnd: Date) => void;
    hours: number[]; // For Day view calculation
}

export function useDragResize({
    entries,
    view,
    onEntryDrop,
    onEntryResize,
    hours
}: UseDragResizeProps) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [suppressClick, setSuppressClick] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);
    const hasMovedRef = useRef(false);
    const suppressClickTimerRef = useRef<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent, entryId: string, type: 'move' | 'resize-start' | 'resize-end') => {
        const entry = entries.find(ent => ent.id === entryId);
        if (!entry) return;

        hasMovedRef.current = false;
        if (suppressClickTimerRef.current !== null) {
            window.clearTimeout(suppressClickTimerRef.current);
            suppressClickTimerRef.current = null;
        }

        const startDate = entry.startDate instanceof Timestamp
            ? entry.startDate.toDate()
            : new Date(entry.startDate as unknown as string);
        const endDate = entry.endDate instanceof Timestamp
            ? entry.endDate.toDate()
            : new Date(entry.endDate as unknown as string);

        setDragState({
            entryId,
            type,
            initialX: e.clientX,
            initialY: e.clientY,
            initialStart: startDate,
            initialEnd: endDate,
            currentX: e.clientX,
            currentY: e.clientY
        });

        // Disable text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = type === 'move' ? 'grabbing' : 'col-resize';
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!dragState) return;

        if (!hasMovedRef.current) {
            const hasMoved = Math.abs(e.clientX - dragState.initialX) > 5 || Math.abs(e.clientY - dragState.initialY) > 5;
            if (hasMoved) {
                hasMovedRef.current = true;
                setSuppressClick(true);
            }
        }

        setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    }, [dragState]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (!dragState) return;

        // Reset body styles
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        const { entryId, type, initialX, initialStart, initialEnd } = dragState;

        if (view === 'day') {
            // Day View Logic: Horizontal modification on timeline
            // Access the specific timeline row element to measure dimensions
            // We use elementFromPoint to find which row we are over, to handle moving between employees?
            // For now, let's assume moving on the same row or rely on drop target detection.

            // Wait, for resizing, we are strictly bound to the timeline logic.
            // We need the width of the "hours" track.
            // Since we don't have a direct ref to the track, we can try to find the track element under the cursor or use the grid layout assumptions.

            // Let's use the drop target approach for everything to be robust.
            const elements = document.elementsFromPoint(e.clientX, e.clientY);
            const slotElement = elements.find(el => el.getAttribute('data-role') === 'day-slot');

            // If we are resizing, we don't necessarily need to be over a slot, we need to know the delta X relative to the slot width.
            // But calculating "pixels to minutes" requires the slot width.

            if (slotElement && slotElement instanceof HTMLElement) {
                const rect = slotElement.getBoundingClientRect();
                // The slot covers the full day (e.g. 6:00 to 20:00 = 14 hours)
                // Actually the slot container has grid columns inside.
                // gridTemplateColumns: repeat(hours.length, 1fr)
                // So the width of one hour = rect.width / hours.length

                const hourWidth = rect.width / hours.length;
                const deltaX = e.clientX - initialX;
                const hoursDelta = deltaX / hourWidth;
                const minutesDelta = hoursDelta * 60;

                // Round to nearest 15 minutes
                const snappedMinutes = Math.round(minutesDelta / 15) * 15;

                if (type === 'resize-start') {
                    const newStart = addMinutes(initialStart, snappedMinutes);
                    // Prevent start > end
                    if (newStart < initialEnd) {
                        onEntryResize(entryId, newStart, initialEnd);
                    }
                } else if (type === 'resize-end') {
                    const newEnd = addMinutes(initialEnd, snappedMinutes);
                    if (newEnd > initialStart) {
                        onEntryResize(entryId, initialStart, newEnd);
                    }
                } else if (type === 'move') {
                    // Calculate new start time
                    const buildingNewStart = addMinutes(initialStart, snappedMinutes);

                    // Check if we changed employee ("row")
                    const targetEmployeeId = slotElement.getAttribute('data-employee-id');

                    // Also check if we changed "Day" (e.g. dragging to another day row)
                    // The slot also has data-date
                    const targetDateStr = slotElement.getAttribute('data-date');

                    if (targetEmployeeId && targetDateStr) {
                        const targetDate = new Date(targetDateStr);
                        // We need to preserve the time of day from the original, but apply the date from target
                        // ACTUALLY, "Day View" usually lists days vertically.
                        // So we take the target date, set the hours/minutes from the computed new start time.

                        // Original time of day
                        const originalHours = buildingNewStart.getHours();
                        const originalMinutes = buildingNewStart.getMinutes();

                        const newStartDate = new Date(targetDate);
                        newStartDate.setHours(originalHours, originalMinutes, 0, 0);

                        onEntryDrop(entryId, newStartDate, targetEmployeeId);
                    }
                }
            }

        } else if (view === 'week' || view === 'month') {
            // Week View: Dragging to different day/employee
            if (type === 'move') {
                const elements = document.elementsFromPoint(e.clientX, e.clientY);
                const slotElement = elements.find(el => el.getAttribute('data-role') === 'week-slot' || el.getAttribute('data-role') === 'month-slot');

                if (slotElement) {
                    const targetDateStr = slotElement.getAttribute('data-date');
                    const targetEmployeeId = slotElement.getAttribute('data-employee-id') ?? '';
                    const fallbackEmployeeId = entries.find(entry => entry.id === entryId)?.employeeId ?? '';

                    if (targetDateStr) {
                        const targetDate = new Date(targetDateStr);

                        // When moving in week view, we usually preserve the time-of-day of the original entry, just change the date.
                        const newStart = new Date(targetDate);
                        newStart.setHours(initialStart.getHours(), initialStart.getMinutes());

                        onEntryDrop(entryId, newStart, targetEmployeeId || fallbackEmployeeId);
                    }
                }
            }
        }

        setDragState(null);
        if (hasMovedRef.current) {
            suppressClickTimerRef.current = window.setTimeout(() => {
                setSuppressClick(false);
                suppressClickTimerRef.current = null;
            }, 150);
        }
    }, [dragState, view, hours, onEntryDrop, onEntryResize, entries]);

    useEffect(() => {
        if (dragState) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [dragState, handlePointerMove, handlePointerUp]);

    useEffect(() => {
        return () => {
            if (suppressClickTimerRef.current !== null) {
                window.clearTimeout(suppressClickTimerRef.current);
            }
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, []);

    const isDragging = !!dragState && hasMovedRef.current;

    return {
        onDragStart: handlePointerDown,
        dragState,
        gridRef,
        isDragging,
        suppressClick
    };
}
