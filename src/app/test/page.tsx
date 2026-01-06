// Bestand: src/app/test/page.tsx
// Doel: Testpagina voor "Werkwijze → Inbegrepen → Aanpassen (advanced)".
// Belangrijk: GEEN jobtype-keuze en GEEN metingen hier. Dit is alleen de opbouw/werkwijze voor:
// "HSB Voorzetwand — enkelzijdig bekleed" (die keuze en metingen komen al uit je bestaande flow).

'use client';

import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type WerkwijzeKey = 'standaard' | 'akoestisch' | 'installatiezone' | 'constructief' | 'custom';

type Modules = {
  regelwerk: boolean;
  beplating: boolean;
  isolatie: boolean;
  installatiezone: boolean;
  dampremming: boolean;
  luchtdichting: boolean;
  constructievePlaat: boolean;
  aansluitingenProfielen: boolean;
  sparingen: boolean;
};

type Regelwerk = {
  // super beperkt: default = AI/standaard, user override alleen als nodig
  diepteMm: 45 | 70 | 95 | 'ai';
};

type Beplating = {
  // enkelzijdig bekleed staat vast in je bestaande flow, dus hier alleen type/dikte override
  plaattype: 'gipsplaat' | 'fermacell' | 'osb' | 'anders' | 'ai';
  plaatAndersNaam: string;
  dikteMm: number | '';
};

type Isolatie = {
  // default: AI kiest uit database; user geeft alleen dikte (meest voorkomende behoefte)
  aiKiest: boolean;
  dikteMm: number | '';
  vorm: 'dekens' | 'platen' | 'ai';
  prioriteit: 'budget' | 'akoestiek' | 'thermisch' | 'brand';
};

type Installatiezone = {
  diepteMm: 45 | 70 | 95 | 'ai';
  richting: 'horizontaal' | 'verticaal';
};

type Dampremming = {
  type: 'standaard' | 'intelligent';
};

type Luchtdichting = {
  detailniveau: 'basis' | 'uitgebreid';
};

type ConstructievePlaat = {
  plaattype: 'osb' | 'underlayment' | 'anders' | 'ai';
  plaatAndersNaam: string;
  dikteMm: number | '';
};

type Aansluitingen = {
  niveau: 'basis' | 'uitgebreid';
  plintAfwerkprofiel: boolean;
};

type Sparingen = {
  // keep simple: user zet alleen "aan/uit" + later in echte flow sparingen apart
  actief: boolean;
};

type State = {
  werkwijze: WerkwijzeKey;
  modules: Modules;
  regelwerk: Regelwerk;
  beplating: Beplating;
  isolatie: Isolatie;
  installatiezone: Installatiezone;
  dampremming: Dampremming;
  luchtdichting: Luchtdichting;
  constructievePlaat: ConstructievePlaat;
  aansluitingen: Aansluitingen;
  sparingen: Sparingen;
};

function parseNumber(v: string): number | '' {
  if (v.trim() === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function Chip({
  actief,
  label,
  onClick,
}: {
  actief: boolean;
  label: string;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
        actief
          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
          : 'border-white/10 bg-white/5 text-white/70',
        clickable ? 'hover:bg-white/10' : 'cursor-default',
      ].join(' ')}
    >
      <span
        className={[
          'h-2 w-2 rounded-full',
          actief ? 'bg-emerald-400' : 'bg-white/25',
        ].join(' ')}
      />
      {label}
    </button>
  );
}

function SectieTitel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-medium text-white/90">{children}</div>;
}

function Paneel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4">
      {children}
    </div>
  );
}

const MODULE_LABELS: Array<[keyof Modules, string]> = [
  ['regelwerk', 'Regelwerk'],
  ['beplating', 'Beplating'],
  ['isolatie', 'Isolatie'],
  ['installatiezone', 'Installatiezone'],
  ['dampremming', 'Dampremming'],
  ['luchtdichting', 'Luchtdichting'],
  ['constructievePlaat', 'Constructieve plaat'],
  ['aansluitingenProfielen', 'Aansluitingen & profielen'],
  ['sparingen', 'Sparingen'],
];

function presetState(werkwijze: WerkwijzeKey): State {
  // Baseline: snel en “meest gekozen”. Alles staat al logisch aan.
  const basis: State = {
    werkwijze,
    modules: {
      regelwerk: true,
      beplating: true,
      isolatie: true,
      installatiezone: false,
      dampremming: false,
      luchtdichting: false,
      constructievePlaat: false,
      aansluitingenProfielen: false,
      sparingen: false,
    },
    regelwerk: { diepteMm: 'ai' },
    beplating: { plaattype: 'ai', plaatAndersNaam: '', dikteMm: 12.5 },
    isolatie: { aiKiest: true, dikteMm: 70, vorm: 'ai', prioriteit: 'akoestiek' },
    installatiezone: { diepteMm: 'ai', richting: 'horizontaal' },
    dampremming: { type: 'standaard' },
    luchtdichting: { detailniveau: 'basis' },
    constructievePlaat: { plaattype: 'ai', plaatAndersNaam: '', dikteMm: 12 },
    aansluitingen: { niveau: 'basis', plintAfwerkprofiel: false },
    sparingen: { actief: false },
  };

  if (werkwijze === 'akoestisch') {
    return {
      ...basis,
      modules: {
        ...basis.modules,
        luchtdichting: true,
      },
      isolatie: {
        ...basis.isolatie,
        prioriteit: 'akoestiek',
        dikteMm: 70,
      },
      luchtdichting: { detailniveau: 'basis' },
    };
  }

  if (werkwijze === 'installatiezone') {
    return {
      ...basis,
      modules: {
        ...basis.modules,
        installatiezone: true,
        luchtdichting: true,
      },
      installatiezone: { diepteMm: 45, richting: 'horizontaal' },
      luchtdichting: { detailniveau: 'basis' },
    };
  }

  if (werkwijze === 'constructief') {
    return {
      ...basis,
      modules: {
        ...basis.modules,
        constructievePlaat: true,
      },
      constructievePlaat: { plaattype: 'osb', plaatAndersNaam: '', dikteMm: 12 },
    };
  }

  if (werkwijze === 'custom') {
    // custom = start ook vanuit basis, maar laat user alles aanpassen
    return {
      ...basis,
      modules: {
        regelwerk: true,
        beplating: true,
        isolatie: true,
        installatiezone: true,
        dampremming: true,
        luchtdichting: true,
        constructievePlaat: true,
        aansluitingenProfielen: true,
        sparingen: true,
      },
    };
  }

  return basis;
}

export default function TestPage() {
  const [toonAanpassen, setToonAanpassen] = useState(false);
  const [state, setState] = useState<State>(() => presetState('standaard'));

  function setWerkwijze(w: WerkwijzeKey) {
    setState(presetState(w));
    setToonAanpassen(false);
  }

  function toggleModule(key: keyof Modules) {
    setState((prev) => ({
      ...prev,
      werkwijze: prev.werkwijze === 'custom' ? 'custom' : 'custom', // zodra je aanpast is het custom
      modules: { ...prev.modules, [key]: !prev.modules[key] },
    }));
  }

  const inbegrepen = useMemo(() => {
    return MODULE_LABELS.filter(([k]) => state.modules[k]).map(([, label]) => label);
  }, [state.modules]);

  const payload = useMemo(() => {
    // Dit is EXACT wat je later naar je AI-resolver stuurt,
    // plus een referentie dat metingen uit je bestaande flow komen.
    // (Je kunt hier later de echte metingen bijplakken vóór AI-call.)
    return {
      jobType: 'HSB Voorzetwand',
      variant: 'enkelzijdig_bekleed',
      metingenBron: 'bestaande workflow (maten pagina)',
      werkwijze: state.werkwijze,
      modules: { ...state.modules },
      instellingen: {
        regelwerk: state.modules.regelwerk ? state.regelwerk : null,
        beplating: state.modules.beplating ? state.beplating : null,
        isolatie: state.modules.isolatie ? state.isolatie : null,
        installatiezone: state.modules.installatiezone ? state.installatiezone : null,
        dampremming: state.modules.dampremming ? state.dampremming : null,
        luchtdichting: state.modules.luchtdichting ? state.luchtdichting : null,
        constructievePlaat: state.modules.constructievePlaat ? state.constructievePlaat : null,
        aansluitingen: state.modules.aansluitingenProfielen ? state.aansluitingen : null,
        sparingen: state.modules.sparingen ? state.sparingen : null,
      },
      // later: userMaterialCatalog: [...]
    };
  }, [state]);

  async function kopieerPayload() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('Payload gekopieerd ✅');
    } catch {
      alert('Kopiëren mislukt. Kopieer handmatig uit het blok.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            /test — HSB Voorzetwand (enkelzijdig bekleed)
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Werkwijze selecteren → standaard inbegrepen → alleen aanpassen als nodig.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={kopieerPayload}>Payload kopiëren</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setState(presetState('standaard'));
              setToonAanpassen(false);
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* 1) Werkwijze */}
      <Card className="border-white/10 bg-black/30">
        <CardHeader>
          <CardTitle>Werkwijze</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Chip
              actief={state.werkwijze === 'standaard'}
              label="Standaard"
              onClick={() => setWerkwijze('standaard')}
            />
            <Chip
              actief={state.werkwijze === 'akoestisch'}
              label="Akoestisch"
              onClick={() => setWerkwijze('akoestisch')}
            />
            <Chip
              actief={state.werkwijze === 'installatiezone'}
              label="Installatiezone"
              onClick={() => setWerkwijze('installatiezone')}
            />
            <Chip
              actief={state.werkwijze === 'constructief'}
              label="Constructief (OSB)"
              onClick={() => setWerkwijze('constructief')}
            />
            <Chip
              actief={state.werkwijze === 'custom'}
              label="Custom"
              onClick={() => setWerkwijze('custom')}
            />
          </div>

          <div className="text-sm text-white/60">
            Tip: 95% van de tijd kies je één werkwijze en ga je door. “Aanpassen” is alleen voor uitzonderingen.
          </div>
        </CardContent>
      </Card>

      {/* 2) Inbegrepen */}
      <Card className="border-white/10 bg-black/30">
        <CardHeader>
          <CardTitle>Inbegrepen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {MODULE_LABELS.map(([key, label]) => (
              <Chip key={key} actief={state.modules[key]} label={label} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-white/60">
              Nu actief: <span className="text-white/80">{inbegrepen.join(', ')}</span>
            </div>

            <Button
              variant="secondary"
              onClick={() => setToonAanpassen((v) => !v)}
            >
              {toonAanpassen ? 'Aanpassen sluiten' : 'Aanpassen'}
            </Button>
          </div>

          {/* 3) Aanpassen (advanced) */}
          {toonAanpassen && (
            <Paneel>
              <SectieTitel>Modules aan/uit</SectieTitel>
              <div className="flex flex-wrap gap-2">
                {MODULE_LABELS.map(([key, label]) => (
                  <Chip
                    key={key}
                    actief={state.modules[key]}
                    label={label}
                    onClick={() => toggleModule(key)}
                  />
                ))}
              </div>

              {/* Minimal overrides — alleen tonen als module aan staat */}
              <div className="mt-6 space-y-6">
                {state.modules.regelwerk && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Regelwerk</SectieTitel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Diepte</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.regelwerk.diepteMm}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              regelwerk: {
                                ...p.regelwerk,
                                diepteMm:
                                  e.target.value === 'ai'
                                    ? 'ai'
                                    : (Number(e.target.value) as 45 | 70 | 95),
                              },
                            }))
                          }
                        >
                          <option value="ai">AI / standaard</option>
                          <option value={45}>45 mm</option>
                          <option value={70}>70 mm</option>
                          <option value={95}>95 mm</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      Dit stuurt de houtsectie. H.o.h. + maten komen uit je metingenpagina.
                    </div>
                  </div>
                )}

                {state.modules.isolatie && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Isolatie</SectieTitel>
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        actief={state.isolatie.aiKiest}
                        label="AI kiest uit mijn materialen"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            isolatie: { ...p.isolatie, aiKiest: !p.isolatie.aiKiest },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Dikte (mm)</Label>
                        <Input
                          value={state.isolatie.dikteMm}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              isolatie: { ...p.isolatie, dikteMm: parseNumber(e.target.value) },
                            }))
                          }
                          placeholder="bijv. 70"
                        />
                      </div>

                      {!state.isolatie.aiKiest && (
                        <>
                          <div className="space-y-1">
                            <Label>Vorm</Label>
                            <select
                              className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                              value={state.isolatie.vorm}
                              onChange={(e) =>
                                setState((p) => ({
                                  ...p,
                                  werkwijze: 'custom',
                                  isolatie: { ...p.isolatie, vorm: e.target.value as any },
                                }))
                              }
                            >
                              <option value="ai">AI / standaard</option>
                              <option value="dekens">Dekens</option>
                              <option value="platen">Platen</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <Label>Prioriteit</Label>
                            <select
                              className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                              value={state.isolatie.prioriteit}
                              onChange={(e) =>
                                setState((p) => ({
                                  ...p,
                                  werkwijze: 'custom',
                                  isolatie: { ...p.isolatie, prioriteit: e.target.value as any },
                                }))
                              }
                            >
                              <option value="budget">Budget</option>
                              <option value="akoestiek">Akoestiek</option>
                              <option value="thermisch">Thermisch</option>
                              <option value="brand">Brand</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-white/50">
                      Standaard: AI kiest het beste item uit de supplierlijst op basis van dikte + beschikbaarheid.
                    </div>
                  </div>
                )}

                {state.modules.beplating && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Beplating (enkelzijdig)</SectieTitel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Plaattype</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.beplating.plaattype}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              beplating: { ...p.beplating, plaattype: e.target.value as any },
                            }))
                          }
                        >
                          <option value="ai">AI / standaard</option>
                          <option value="gipsplaat">Gipsplaat</option>
                          <option value="fermacell">Fermacell</option>
                          <option value="osb">OSB</option>
                          <option value="anders">Anders</option>
                        </select>
                      </div>

                      {state.beplating.plaattype === 'anders' && (
                        <div className="space-y-1">
                          <Label>Naam</Label>
                          <Input
                            value={state.beplating.plaatAndersNaam}
                            onChange={(e) =>
                              setState((p) => ({
                                ...p,
                                werkwijze: 'custom',
                                beplating: { ...p.beplating, plaatAndersNaam: e.target.value },
                              }))
                            }
                            placeholder="bijv. cementplaat"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label>Dikte (mm)</Label>
                        <Input
                          value={state.beplating.dikteMm}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              beplating: { ...p.beplating, dikteMm: parseNumber(e.target.value) },
                            }))
                          }
                          placeholder="bijv. 12.5"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      Enkelzijdig is al vastgelegd in je eerdere job-keuze. Hier alleen materiaalkeuze override.
                    </div>
                  </div>
                )}

                {state.modules.installatiezone && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Installatiezone</SectieTitel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Diepte</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.installatiezone.diepteMm}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              installatiezone: {
                                ...p.installatiezone,
                                diepteMm:
                                  e.target.value === 'ai'
                                    ? 'ai'
                                    : (Number(e.target.value) as 45 | 70 | 95),
                              },
                            }))
                          }
                        >
                          <option value="ai">AI / standaard</option>
                          <option value={45}>45 mm</option>
                          <option value={70}>70 mm</option>
                          <option value={95}>95 mm</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label>Richting</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.installatiezone.richting}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              installatiezone: { ...p.installatiezone, richting: e.target.value as any },
                            }))
                          }
                        >
                          <option value="horizontaal">Horizontaal</option>
                          <option value="verticaal">Verticaal</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {state.modules.dampremming && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Dampremming</SectieTitel>
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        actief={state.dampremming.type === 'standaard'}
                        label="Standaard"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            dampremming: { type: 'standaard' },
                          }))
                        }
                      />
                      <Chip
                        actief={state.dampremming.type === 'intelligent'}
                        label="Intelligent"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            dampremming: { type: 'intelligent' },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {state.modules.luchtdichting && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Luchtdichting</SectieTitel>
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        actief={state.luchtdichting.detailniveau === 'basis'}
                        label="Basis"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            luchtdichting: { detailniveau: 'basis' },
                          }))
                        }
                      />
                      <Chip
                        actief={state.luchtdichting.detailniveau === 'uitgebreid'}
                        label="Uitgebreid"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            luchtdichting: { detailniveau: 'uitgebreid' },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {state.modules.constructievePlaat && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Constructieve plaat</SectieTitel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Plaattype</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.constructievePlaat.plaattype}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              constructievePlaat: { ...p.constructievePlaat, plaattype: e.target.value as any },
                            }))
                          }
                        >
                          <option value="ai">AI / standaard</option>
                          <option value="osb">OSB</option>
                          <option value="underlayment">Underlayment</option>
                          <option value="anders">Anders</option>
                        </select>
                      </div>

                      {state.constructievePlaat.plaattype === 'anders' && (
                        <div className="space-y-1">
                          <Label>Naam</Label>
                          <Input
                            value={state.constructievePlaat.plaatAndersNaam}
                            onChange={(e) =>
                              setState((p) => ({
                                ...p,
                                werkwijze: 'custom',
                                constructievePlaat: { ...p.constructievePlaat, plaatAndersNaam: e.target.value },
                              }))
                            }
                            placeholder="bijv. cementgebonden plaat"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label>Dikte (mm)</Label>
                        <Input
                          value={state.constructievePlaat.dikteMm}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              constructievePlaat: { ...p.constructievePlaat, dikteMm: parseNumber(e.target.value) },
                            }))
                          }
                          placeholder="bijv. 12"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {state.modules.aansluitingenProfielen && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Aansluitingen & profielen</SectieTitel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Niveau</Label>
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm"
                          value={state.aansluitingen.niveau}
                          onChange={(e) =>
                            setState((p) => ({
                              ...p,
                              werkwijze: 'custom',
                              aansluitingen: { ...p.aansluitingen, niveau: e.target.value as any },
                            }))
                          }
                        >
                          <option value="basis">Basis</option>
                          <option value="uitgebreid">Uitgebreid</option>
                        </select>
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <Label>Plint / afwerkprofiel</Label>
                        <div className="flex gap-2">
                          <Chip
                            actief={state.aansluitingen.plintAfwerkprofiel === true}
                            label="Ja"
                            onClick={() =>
                              setState((p) => ({
                                ...p,
                                werkwijze: 'custom',
                                aansluitingen: { ...p.aansluitingen, plintAfwerkprofiel: true },
                              }))
                            }
                          />
                          <Chip
                            actief={state.aansluitingen.plintAfwerkprofiel === false}
                            label="Nee"
                            onClick={() =>
                              setState((p) => ({
                                ...p,
                                werkwijze: 'custom',
                                aansluitingen: { ...p.aansluitingen, plintAfwerkprofiel: false },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {state.modules.sparingen && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <SectieTitel>Sparingen</SectieTitel>
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        actief={state.sparingen.actief}
                        label={state.sparingen.actief ? 'Aan' : 'Uit'}
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            werkwijze: 'custom',
                            sparingen: { actief: !p.sparingen.actief },
                          }))
                        }
                      />
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      In je echte flow voeg je sparingen met maten apart toe. Hier is het alleen een signaal voor de AI.
                    </div>
                  </div>
                )}
              </div>
            </Paneel>
          )}
        </CardContent>
      </Card>

      {/* Payload */}
      <Card className="border-white/10 bg-black/30">
        <CardHeader>
          <CardTitle>Payload (voor AI / resolver)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black/60 p-4 text-xs leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
          <div className="mt-3 text-sm text-white/60">
            Deze pagina doet expres geen metingen. In productie plak je hier de metingen bij vóór je AI-call.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
