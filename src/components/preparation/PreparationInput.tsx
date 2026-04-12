'use client';

import { ChangeEvent } from 'react';
import { ImagePlus, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PreparationInputProps {
  value: string;
  file: File | null;
  isLoading: boolean;
  onValueChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
}

export function PreparationInput({
  value,
  file,
  isLoading,
  onValueChange,
  onFileChange,
  onSubmit,
}: PreparationInputProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] || null;
    onFileChange(picked);
  };

  const hasInput = value.trim().length > 0 || Boolean(file);

  return (
    <Card className="border-border/70 bg-card/40 backdrop-blur">
      <CardHeader>
        <CardTitle>Input van klant</CardTitle>
        <CardDescription>
          Voeg klanttekst toe en/of upload een screenshot. Daarna maakt de agent een intake-voorbereiding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prep-agent-input">Klantidee of briefing</Label>
          <Textarea
            id="prep-agent-input"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Bijv. klant wil een voorzetwand en tv-nis in de woonkamer, oplevering binnen 3 weken..."
            className="min-h-[160px]"
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="prep-agent-file">Screenshot (optioneel)</Label>
          <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-3">
            <input
              id="prep-agent-file"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isLoading}
              className="block w-full cursor-pointer text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
            />
            {file && (
              <p className="mt-2 text-xs text-muted-foreground">
                Geselecteerd: <span className="text-foreground">{file.name}</span>
              </p>
            )}
            {!file && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ondersteund: JPG, PNG, WEBP, HEIC/HEIF (max 8MB).
              </p>
            )}
          </div>
        </div>

        <Button onClick={onSubmit} disabled={isLoading || !hasInput} className="w-full sm:w-auto">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Voorbereiding maken...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Genereer voorbereiding
            </>
          )}
        </Button>

        {!hasInput && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <ImagePlus className="h-4 w-4 shrink-0" />
            Voeg minimaal tekst of een screenshot toe.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
