'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  retainsHistory,
  today,
  toMarkdown,
  validWorkspace,
  workspaceSchema,
  type Workspace,
} from '@/lib/vision/model';
import { Details, Field, inputClass } from './Fields';
import { download, type Change } from './useVision';
export function Backup({ w, change }: { w: Workspace; change: Change }) {
  const [imported, setImported] = useState<Workspace | null>(null),
    [message, setMessage] = useState('');
  return (
    <Details title="Export, back-up en herstel">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            download('vision-' + today() + '.json', JSON.stringify(w, null, 2), 'application/json')
          }
        >
          Volledige JSON-back-up
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => download('vision-' + today() + '.md', toMarkdown(w), 'text/markdown')}
        >
          Markdown downloaden
        </Button>
      </div>
      <Field label="Vision-back-up openen">
        <input
          type="file"
          className={inputClass}
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            setImported(null);
            setMessage('');
            if (!file) return;
            try {
              const data = workspaceSchema.parse(JSON.parse(await file.text()));
              if (!validWorkspace(data)) throw Error();
              setImported(data);
            } catch {
              setMessage('Dit bestand is geen geldige Vision-back-up.');
            }
          }}
        />
      </Field>
      {imported && (
        <div className="space-y-2 text-sm">
          <p>
            {imported.goals.length} doelen, {imported.notes.length} inzichten en {imported.reports.length}{' '}
            analyses. Herstel vervangt je instellingen. Bestaande notitieversies blijven bewaard.
            AI-toestemming staat na herstel uit.
          </p>
          <Button
            onClick={() => {
              const notes = new Map(w.notes.map((n) => [n.id, n]));
              for (const n of imported.notes) {
                const old = notes.get(n.id);
                if (!old) {
                  notes.set(n.id, n);
                  continue;
                }
                const history = (versions: typeof n.versions) => ({ ...w, notes: [{ ...n, versions }] });
                if (n.created !== old.created) {
                  setMessage('Botsende notitie-identiteit. Herstel is afgebroken.');
                  return;
                }
                if (retainsHistory(history(old.versions), history(n.versions))) notes.set(n.id, n);
                else if (!retainsHistory(history(n.versions), history(old.versions))) {
                  setMessage('Twee verschillende versies met dezelfde oorsprong. Herstel is afgebroken.');
                  return;
                }
              }
              const next = {
                ...imported,
                notes: [...notes.values()],
                consent: { enabled: false, notes: false, goals: false, finance: false, relationships: false },
              };
              if (!validWorkspace(next)) {
                setMessage('De herstelde koppelingen zijn onvolledig.');
                return;
              }
              change(() => next);
              setImported(null);
              setMessage('Back-up ingelezen.');
            }}
          >
            Deze back-up herstellen
          </Button>
        </div>
      )}
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </Details>
  );
}
