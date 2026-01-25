/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Play,
    Pause,
    Square,
    Clock,
    Coffee,
    AlertTriangle,
    History,
    Calendar,
    Trash2,
    Save,
    X,
    Check
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, differenceInSeconds, addHours, setHours, setMinutes, startOfToday, parse, eachDayOfInterval, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Types
interface TimeEntry {
    id: string;
    date: string; // ISO date string
    totalHours: number;
    source: 'today_quick' | 'timer_rounded' | 'timer_exact' | 'manual';
    exactMinutes?: number;
    roundingRule?: string;

    // Optional legacy/manual fields
    startTime?: string;
    endTime?: string;
    breakDuration?: number;

    quoteId?: string;
    quoteTitle?: string;
    description?: string;
    createdAt: number;
}

interface UserSettings {
    defaultStartTime: string;
    defaultEndTime: string;
    defaultBreakDuration: number;
    dailyTargetHours: number;
}

const DEFAULT_SETTINGS: UserSettings = {
    defaultStartTime: '08:00',
    defaultEndTime: '17:00',
    defaultBreakDuration: 60, // 1 hour
    dailyTargetHours: 8,
};

function getQuoteDisplayTitle(q: any) {
    if (q?.titel || q?.title) return q.titel || q.title;
    const info = q?.klantinformatie;
    if (info?.straat) return `${info.straat} ${info.huisnummer || ''}`.trim();
    return 'Naamloze klus';
}

function getQuoteLabel(q: any) {
    const info = q?.klantinformatie;
    const klantNaam = [info?.voornaam, info?.achternaam].filter(Boolean).join(' ') || info?.bedrijfsnaam;
    const title = getQuoteDisplayTitle(q);

    const parts = [];
    if (typeof q.offerteNummer === 'number') parts.push(`#${q.offerteNummer}`);
    if (klantNaam) parts.push(klantNaam);
    parts.push(title);

    return parts.join(' - ');
}

export default function UrenRegistratiePage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();

    // State
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'today' | 'timer' | 'manual'>('today');

    // Shared State
    const [quotes, setQuotes] = useState<any[]>([]);
    const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
    const [history, setHistory] = useState<TimeEntry[]>([]);
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null);
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

    // Tab 1: Vandaag State
    const [todayDate, setTodayDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
    const [customHoursOpen, setCustomHoursOpen] = useState(false);
    const [customHoursValue, setCustomHoursValue] = useState('');
    const [selectedQuickHours, setSelectedQuickHours] = useState<number | null>(null);

    // Tab 2: Timer State
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [currentBreakMinutes, setCurrentBreakMinutes] = useState(0);
    const [stopModalOpen, setStopModalOpen] = useState(false);

    // Tab 3: Corrigeren State
    const [manualDate, setManualDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [manualHours, setManualHours] = useState('');
    const [showManualDetails, setShowManualDetails] = useState(false);
    const [manualStart, setManualStart] = useState('');
    const [manualEnd, setManualEnd] = useState('');
    const [manualBreak, setManualBreak] = useState('');

    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // ------------------------------------------------------------------
    // Effects
    // ------------------------------------------------------------------

    useEffect(() => {
        setMounted(true);
        // Load Settings
        const savedSettings = localStorage.getItem('urenregistratie_settings');
        if (savedSettings) setSettings(JSON.parse(savedSettings));

        // Load History
        const savedHistory = localStorage.getItem('urenregistratie_history');
        if (savedHistory) setHistory(JSON.parse(savedHistory));

        // Load Active Timer
        const savedTimer = localStorage.getItem('urenregistratie_active_timer');
        if (savedTimer) {
            const { start, breakMinutes, quoteId } = JSON.parse(savedTimer);
            const startDate = new Date(start);
            setTimerStartTime(startDate);
            setCurrentBreakMinutes(breakMinutes || 0);
            if (quoteId) setSelectedQuoteId(quoteId);
            setIsTimerRunning(true);
            const diff = differenceInSeconds(new Date(), startDate);
            setElapsedSeconds(diff);
        }
    }, []);

    // Fetch Quotes
    useEffect(() => {
        if (!user || !firestore) return;
        const fetchQuotes = async () => {
            try {
                const q = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                data.sort((a, b) => {
                    const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
                    const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
                    return tB - tA;
                });
                setQuotes(data);
            } catch (err) {
                console.error("Fout bij ophalen offertes:", err);
            }
        };
        fetchQuotes();
    }, [user, firestore]);

    // Save Persistence
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem('urenregistratie_settings', JSON.stringify(settings));
        localStorage.setItem('urenregistratie_history', JSON.stringify(history));
    }, [settings, history, mounted]);

    // Timer Logic
    useEffect(() => {
        if (isTimerRunning && timerStartTime) {
            intervalRef.current = setInterval(() => {
                const now = new Date();
                setElapsedSeconds(differenceInSeconds(now, timerStartTime));
            }, 1000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isTimerRunning, timerStartTime]);

    // Timer Persistence
    useEffect(() => {
        if (!mounted) return;
        if (isTimerRunning && timerStartTime) {
            localStorage.setItem('urenregistratie_active_timer', JSON.stringify({
                start: timerStartTime.toISOString(),
                breakMinutes: currentBreakMinutes,
                quoteId: selectedQuoteId
            }));
        } else {
            localStorage.removeItem('urenregistratie_active_timer');
        }
    }, [isTimerRunning, timerStartTime, currentBreakMinutes, mounted, selectedQuoteId]);


    // ------------------------------------------------------------------
    // Core Functions
    // ------------------------------------------------------------------

    const saveTimeEntry = (params: {
        date: string;
        quoteId: string;
        hours: number;
        source: TimeEntry['source'];
        exactMinutes?: number;
        roundingRule?: string;
        startTime?: string;
        endTime?: string;
        breakDuration?: number;
    }) => {
        if (!params.hours || params.hours <= 0 || params.hours > 24) {
            toast({ title: "Ongeldig aantal uren", variant: "destructive" });
            return;
        }

        const entry: TimeEntry = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            date: params.date,
            totalHours: params.hours,
            source: params.source,
            exactMinutes: params.exactMinutes,
            roundingRule: params.roundingRule,
            quoteId: params.quoteId,
            quoteTitle: params.quoteId ? getQuoteDisplayTitle(quotes.find(q => q.id === params.quoteId)) : undefined,
            startTime: params.startTime,
            endTime: params.endTime,
            breakDuration: params.breakDuration,
        };

        setHistory(prev => [entry, ...prev]);
        setNewlyAddedId(entry.id);

        // Remove highlight after 3 seconds
        setTimeout(() => setNewlyAddedId(null), 3000);

        toast({
            title: "Opgeslagen",
            description: `${formatHours(params.hours)} geboekt op ${format(new Date(params.date), 'd MMM')}`,
            action: (
                <div
                    className="hover:underline cursor-pointer font-medium"
                    onClick={() => {
                        setHistory(prev => prev.filter(e => e.id !== entry.id));
                        toast({ description: "Boeking ongedaan gemaakt." });
                    }}
                >
                    Ongedaan maken
                </div>
            ),
        });
    };

    const handleQuickSave = (hours: number) => {
        if (!selectedQuoteId || selectedQuoteId === 'none') {
            toast({ title: "Kies eerst een klus/project", variant: "destructive" });
            return;
        }

        if (dateMode === 'single') {
            saveTimeEntry({
                date: todayDate,
                quoteId: selectedQuoteId,
                hours: hours,
                source: 'today_quick'
            });
        } else {
            // Range logic
            try {
                const start = parseISO(todayDate);
                const end = parseISO(endDate);
                if (end < start) {
                    toast({ title: "Einddatum moet na startdatum liggen", variant: "destructive" });
                    return;
                }
                const days = eachDayOfInterval({ start, end });
                days.forEach(day => {
                    saveTimeEntry({
                        date: format(day, 'yyyy-MM-dd'),
                        quoteId: selectedQuoteId,
                        hours: hours,
                        source: 'today_quick'
                    });
                });
                toast({ title: `${days.length} dagen geboekt`, description: `Van ${todayDate} t/m ${endDate}` });
            } catch (e) {
                console.error(e);
                toast({ title: "Fout bij verwerken data", variant: "destructive" });
            }
        }
    };

    const handleCustomSave = () => {
        const h = parseFloat(customHoursValue);
        if (isNaN(h)) return;
        if (!selectedQuoteId || selectedQuoteId === 'none') {
            toast({ title: "Kies eerst een klus/project", variant: "destructive" });
            return;
        }

        if (dateMode === 'single') {
            saveTimeEntry({
                date: todayDate,
                quoteId: selectedQuoteId,
                hours: h,
                source: 'today_quick'
            });
        } else {
            try {
                const start = parseISO(todayDate);
                const end = parseISO(endDate);
                if (end < start) {
                    toast({ title: "Einddatum moet na startdatum liggen", variant: "destructive" });
                    return;
                }
                const days = eachDayOfInterval({ start, end });
                days.forEach(day => {
                    saveTimeEntry({
                        date: format(day, 'yyyy-MM-dd'),
                        quoteId: selectedQuoteId,
                        hours: h,
                        source: 'today_quick'
                    });
                });
                toast({ title: `${days.length} dagen geboekt`, description: `Van ${todayDate} t/m ${endDate}` });
            } catch (e) {
                console.error(e);
            }
        }
        setCustomHoursOpen(false);
        setCustomHoursValue('');
    };

    const handleStopTimer = (choice: 'exact' | number) => {
        if (!timerStartTime) return;

        let finalHours = 0;
        let rule = '';
        const exactMinutes = Math.floor((elapsedSeconds / 60) - currentBreakMinutes);
        const exactHours = Math.max(0, exactMinutes / 60);

        if (choice === 'exact') {
            finalHours = exactHours;
            rule = 'Exact';
        } else {
            finalHours = choice;
            rule = 'Afgerond';
        }

        saveTimeEntry({
            date: format(timerStartTime, 'yyyy-MM-dd'),
            quoteId: selectedQuoteId,
            hours: finalHours,
            source: choice === 'exact' ? 'timer_exact' : 'timer_rounded',
            exactMinutes: exactMinutes,
            roundingRule: rule,
            startTime: format(timerStartTime, 'HH:mm'),
            endTime: format(new Date(), 'HH:mm'),
            breakDuration: currentBreakMinutes
        });

        setIsTimerRunning(false);
        setTimerStartTime(null);
        setElapsedSeconds(0);
        setCurrentBreakMinutes(0);
        setStopModalOpen(false);
    };

    const handleManualSave = () => {
        if (!selectedQuoteId || selectedQuoteId === 'none') {
            toast({ title: "Kies eerst een klus", variant: "destructive" });
            return;
        }

        let hours = parseFloat(manualHours);

        // Power user override
        if (showManualDetails && manualStart && manualEnd) {
            const [startH, startM] = manualStart.split(':').map(Number);
            const [endH, endM] = manualEnd.split(':').map(Number);
            const start = new Date(); start.setHours(startH, startM);
            const end = new Date(); end.setHours(endH, endM);
            if (end < start) end.setDate(end.getDate() + 1);
            const diff = differenceInSeconds(end, start);
            const brk = parseInt(manualBreak) || 0;
            hours = (diff / 3600) - (brk / 60);
        }

        if (isNaN(hours)) return;

        saveTimeEntry({
            date: manualDate,
            quoteId: selectedQuoteId,
            hours: hours,
            source: 'manual',
            startTime: showManualDetails ? manualStart : undefined,
            endTime: showManualDetails ? manualEnd : undefined,
            breakDuration: showManualDetails ? (parseInt(manualBreak) || 0) : undefined
        });

        // Reset inputs
        setManualHours('');
        setManualStart('');
        setManualEnd('');
        setManualBreak('');
    };


    // ------------------------------------------------------------------
    // Helpers & Renderers
    // ------------------------------------------------------------------

    const formatTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatHours = (val: number) => {
        const h = Math.floor(val);
        const m = Math.round((val - h) * 60);
        return `${h}u ${m}m`;
    };

    if (!mounted) return null;

    const needsQuoteSelection = !selectedQuoteId || selectedQuoteId === 'none';

    return (
        <div className="min-h-screen pb-24 bg-background">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Clock className="w-6 h-6 text-emerald-500" />
                    Urenregistratie
                </h1>
            </div>

            <div className="container max-w-md mx-auto p-4 space-y-6">
                {/* Main Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="today">Vandaag</TabsTrigger>
                        <TabsTrigger value="timer">Timer</TabsTrigger>
                        <TabsTrigger value="manual" className="text-[10px] sm:text-xs px-1">Corrigeren</TabsTrigger>
                        <TabsTrigger value="history" className="text-[10px] sm:text-xs px-1">Overzicht</TabsTrigger>
                    </TabsList>

                    {/* === TAB 1: VANDAAG === */}
                    <TabsContent value="today" className="space-y-6 mt-6">
                        <Card>
                            <CardHeader className="pb-4">
                                <CardTitle>Uren registratie</CardTitle>
                                <CardDescription>Snel uren boeken op een klus.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Date & Project */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Datum</Label>
                                        <div className="flex items-center gap-4 mb-2">
                                            <div className="flex bg-muted p-1 rounded-lg">
                                                <button
                                                    onClick={() => setDateMode('single')}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                                        dateMode === 'single' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Enkele dag
                                                </button>
                                                <button
                                                    onClick={() => setDateMode('range')}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                                        dateMode === 'range' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Periode
                                                </button>
                                            </div>
                                        </div>

                                        {dateMode === 'single' ? (
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    type="date"
                                                    className="pl-9"
                                                    value={todayDate}
                                                    onChange={(e) => setTodayDate(e.target.value)}
                                                />
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Van</Label>
                                                    <div className="relative">
                                                        <Input
                                                            type="date"
                                                            value={todayDate}
                                                            onChange={(e) => setTodayDate(e.target.value)}
                                                            className="h-9 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Tot en met</Label>
                                                    <div className="relative">
                                                        <Input
                                                            type="date"
                                                            value={endDate}
                                                            onChange={(e) => setEndDate(e.target.value)}
                                                            className="h-9 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Project / Klus</Label>
                                        <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Kies een klus..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Geen offerte</SelectItem>
                                                {quotes.map(q => (
                                                    <SelectItem key={q.id} value={q.id}>
                                                        {getQuoteLabel(q)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Quick Buttons */}
                                <div className="space-y-3">
                                    <Label>Snel boeken</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[8, 7.5, 7, 6].map(h => (
                                            <Button
                                                key={h}
                                                variant="outline"
                                                className={cn(
                                                    "h-14 text-lg font-medium transition-all",
                                                    selectedQuickHours === h
                                                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500"
                                                        : "hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/50"
                                                )}
                                                disabled={needsQuoteSelection}
                                                onClick={() => setSelectedQuickHours(h)}
                                            >
                                                {h} uur
                                            </Button>
                                        ))}
                                    </div>
                                    <Button
                                        variant="secondary"
                                        className="w-full h-12"
                                        disabled={needsQuoteSelection}
                                        onClick={() => setCustomHoursOpen(true)}
                                    >
                                        Anders...
                                    </Button>

                                    <Button
                                        variant="success"
                                        className="w-full h-14 text-lg mt-4 shadow-emerald-500/20 shadow-xl"
                                        disabled={needsQuoteSelection || !selectedQuickHours}
                                        onClick={() => {
                                            if (selectedQuickHours) handleQuickSave(selectedQuickHours);
                                        }}
                                    >
                                        <Save className="mr-2 h-5 w-5" />
                                        Opslaan
                                    </Button>

                                    {needsQuoteSelection && (
                                        <p className="text-xs text-center text-muted-foreground pt-1">
                                            Kies eerst een klus om te boeken.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* === TAB 2: TIMER === */}
                    <TabsContent value="timer" className="space-y-6 mt-6">
                        <Card className={cn(
                            "border-2 transition-all shadow-lg",
                            isTimerRunning ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"
                        )}>
                            <CardContent className="flex flex-col items-center gap-6 py-10">
                                {/* Digital Clock Display */}
                                <div className={cn(
                                    "text-6xl font-mono font-bold tracking-tighter tabular-nums",
                                    isTimerRunning ? "text-foreground" : "text-muted-foreground/30"
                                )}>
                                    {formatTime(elapsedSeconds)}
                                </div>

                                {/* Active Job Display */}
                                <div className="h-8 flex items-center justify-center">
                                    {isTimerRunning && selectedQuoteId && (
                                        <div className="bg-background/50 border px-3 py-1 rounded-full text-xs font-medium text-emerald-600 truncate max-w-[300px]">
                                            {(() => {
                                                const q = quotes.find(q => q.id === selectedQuoteId);
                                                return q ? getQuoteLabel(q) : 'Onbekende offerte';
                                            })()}
                                        </div>
                                    )}
                                </div>

                                {/* Controls */}
                                <div className="w-full grid grid-cols-1 gap-4 max-w-[280px]">
                                    {!isTimerRunning ? (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Project voor timer</Label>
                                                <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Kies een klus..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Geen offerte</SelectItem>
                                                        {quotes.map(q => (
                                                            <SelectItem key={q.id} value={q.id}>
                                                                {getQuoteLabel(q)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button
                                                size="lg"
                                                variant="success"
                                                className="w-full h-16 text-xl shadow-emerald-500/20 shadow-xl"
                                                onClick={() => {
                                                    setTimerStartTime(new Date());
                                                    setIsTimerRunning(true);
                                                    setElapsedSeconds(0);
                                                }}
                                                disabled={needsQuoteSelection}
                                            >
                                                <Play className="mr-2 w-6 h-6" fill="currentColor" />
                                                Start
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <Button
                                                variant="outline"
                                                size="lg"
                                                className="w-full h-12"
                                                onClick={() => setCurrentBreakMinutes(prev => prev + 15)}
                                            >
                                                <Coffee className="mr-2 w-4 h-4 text-orange-500" />
                                                +15m Pauze ({currentBreakMinutes}m)
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="lg"
                                                className="w-full h-16 text-xl shadow-red-500/20 shadow-xl"
                                                onClick={() => setStopModalOpen(true)}
                                            >
                                                <Square className="mr-2 w-5 h-5" fill="currentColor" />
                                                Stop
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* === TAB 3: CORRIGEREN === */}
                    <TabsContent value="manual" className="space-y-6 mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Corrigeren / Handmatig</CardTitle>
                                <CardDescription>Gedetailleerde invoer of correcties.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="space-y-2">
                                    <Label>Datum</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            className="pl-9"
                                            value={manualDate}
                                            onChange={(e) => setManualDate(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Project</Label>
                                    <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Kies klus..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Geen offerte</SelectItem>
                                            {quotes.map(q => (
                                                <SelectItem key={q.id} value={q.id}>
                                                    {getQuoteLabel(q)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Aantal uren</Label>
                                    <Input
                                        type="number"
                                        placeholder="Bijv. 8 of 4.5"
                                        value={manualHours}
                                        onChange={(e) => setManualHours(e.target.value)}
                                        disabled={showManualDetails}
                                    />
                                    {showManualDetails && <p className="text-xs text-muted-foreground">Uren worden berekend op basis van start/eind.</p>}
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    <Switch checked={showManualDetails} onCheckedChange={setShowManualDetails} id="details-mode" />
                                    <Label htmlFor="details-mode" className="text-sm text-muted-foreground cursor-pointer">
                                        Gebruik start/eindtijden (Power User)
                                    </Label>
                                </div>

                                {showManualDetails && (
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
                                        <div className="space-y-2">
                                            <Label className="text-xs">Start</Label>
                                            <Input type="time" value={manualStart} onChange={e => setManualStart(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Eind</Label>
                                            <Input type="time" value={manualEnd} onChange={e => setManualEnd(e.target.value)} />
                                        </div>
                                        <div className="col-span-2 space-y-2">
                                            <Label className="text-xs">Pauze (min)</Label>
                                            <Input type="number" placeholder="0" value={manualBreak} onChange={e => setManualBreak(e.target.value)} />
                                        </div>
                                    </div>
                                )}

                                <Button
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12"
                                    onClick={handleManualSave}
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    Opslaan
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* === TAB 4: OVERZICHT (HISTORY) === */}
                    <TabsContent value="history" className="space-y-6 mt-6">
                        <div className="space-y-3">
                            {history.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground italic bg-card/50 rounded-xl border border-dashed">
                                    Nog geen uren geregistreerd.
                                </div>
                            )}
                            {history.map((entry) => {
                                const isNew = entry.id === newlyAddedId;
                                return (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            "group bg-card border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-500",
                                            isNew ? "ring-2 ring-emerald-500 bg-emerald-500/5 scale-[1.02]" : "hover:border-zinc-700"
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-medium text-sm flex items-center gap-2 mb-1">
                                                {format(new Date(entry.date), 'd MMM yyyy', { locale: nl })}
                                                {/* Source Badges */}
                                                {(entry.source === 'timer_rounded' || entry.source === 'timer_exact') && (
                                                    <span className="bg-blue-500/10 text-blue-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">TIMER</span>
                                                )}
                                            </div>

                                            {entry.quoteId ? (
                                                <div className="text-sm text-zinc-300 font-medium truncate max-w-[200px] mb-1">
                                                    {entry.quoteTitle || 'Offerte'}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-zinc-500 italic">Geen klus</div>
                                            )}

                                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                {entry.source === 'timer_rounded' && <span className="text-zinc-500">Afgerond</span>}
                                                {entry.source === 'timer_exact' && <span className="text-zinc-500">Exact</span>}
                                                {entry.startTime && <span>{entry.startTime} - {entry.endTime}</span>}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-lg font-bold tabular-nums text-white">
                                                    {formatHours(entry.totalHours)}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
                                                onClick={() => setEntryToDelete(entry)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* === MODALS === */}

            {/* Stop Timer Modal */}
            <Dialog open={stopModalOpen} onOpenChange={setStopModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Klus afronden</DialogTitle>
                        <DialogDescription>
                            Je hebt <strong>{formatHours((elapsedSeconds / 3600) - (currentBreakMinutes / 60))}</strong> gewerkt.
                            Hoe wil je dit opslaan?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-2 py-4">
                        {[8, 7.5, 7, 6, 5, 4].map(h => (
                            <Button key={h} variant="outline" className="justify-between group" onClick={() => handleStopTimer(h)}>
                                <span>Rond af naar <strong>{h} uur</strong></span>
                                <Check className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                            </Button>
                        ))}
                        <Button variant="secondary" className="justify-between" onClick={() => handleStopTimer('exact')}>
                            <span>Exact opslaan</span>
                            <span className="text-xs text-muted-foreground">
                                {formatHours((elapsedSeconds / 3600) - (currentBreakMinutes / 60))}
                            </span>
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setStopModalOpen(false)}>Annuleren</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Custom Hours Modal */}
            <Dialog open={customHoursOpen} onOpenChange={setCustomHoursOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Aantal uren</DialogTitle>
                        <DialogDescription>Voer het aantal gewerkte uren in.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            type="number"
                            autoFocus
                            placeholder="Bijv. 5.5"
                            step="0.5"
                            value={customHoursValue}
                            onChange={(e) => setCustomHoursValue(e.target.value)}
                            className="text-lg h-12"
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCustomSave} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">Opslaan</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Weet je zeker dat je deze boeking van <strong>{entryToDelete && formatHours(entryToDelete.totalHours)}</strong> wilt verwijderen?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Annuleren</AlertDialogCancel>
                        <Button
                            onClick={() => {
                                if (entryToDelete) {
                                    setHistory(prev => prev.filter(e => e.id !== entryToDelete.id));
                                    setEntryToDelete(null);
                                    toast({ description: "Verwijderd." });
                                }
                            }}
                            variant="destructiveSoft"
                        >
                            Verwijderen
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Quick Save Safety Confirmation REMOVED */}

            <BottomNav />
        </div >
    );
}
