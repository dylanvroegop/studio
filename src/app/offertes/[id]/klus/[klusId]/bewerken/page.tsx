import { getJobById, getMaterialsForJob } from '@/lib/data';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, PlusCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { updateJobAction } from '@/lib/actions';
import type { MaterialUnit, MaterialCategory } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const subcategories: Record<string, string[]> = {
    Wanden: ["HSB Tussenwand", "Metalstud Wand", "Binnenwand Massief"],
    Plafonds: ["Gipsplaten plafond", "Systeemplafond", "Houten rachelwerk"],
    Daken: ["EPDM Dakbedekking", "Pannendak", "Bitumen dak"],
    default: ["Standaard"]
}

const materialCategories: MaterialCategory[] = ["hout", "isolatie", "plaat", "gips", "bevestiging", "afwerking"];
const materialUnits: MaterialUnit[] = ["m1", "m2", "st", "pak", "uur"];


export default async function EditJobPage({ params }: { params: { id: string; klusId: string } }) {
  const { id: quoteId, klusId } = params;
  const job = await getJobById(klusId);
  const materials = await getMaterialsForJob(klusId);

  if (!job) {
    notFound();
  }

  const updateJobWithId = updateJobAction.bind(null, quoteId, klusId);
  const currentSubcategories = subcategories[job.categorie] || subcategories.default;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="max-w-4xl mx-auto w-full">
         <form action={updateJobWithId}>
            <div className="flex items-center gap-4 mb-8">
                <Button asChild variant="outline" size="icon" className="h-7 w-7">
                    <Link href={`/offertes/${quoteId}`}>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Terug</span>
                    </Link>
                </Button>
                <div className="flex-grow">
                    <h1 className="font-semibold text-2xl">Klus bewerken: {job.categorie}</h1>
                </div>
                <Button size="sm" type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Save className="mr-2 h-4 w-4" />
                    Klus Opslaan
                </Button>
            </div>
        
            <Tabs defaultValue="details">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="details">Details & Afmetingen</TabsTrigger>
                    <TabsTrigger value="materials">Materialen</TabsTrigger>
                    <TabsTrigger value="extras">Extra's</TabsTrigger>
                </TabsList>
                
                {/* Details Tab */}
                <TabsContent value="details">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details en Afmetingen</CardTitle>
                            <CardDescription>Specificeer de klus voor de offerte.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="subcategorie">Subcategorie</Label>
                                    <Select name="subcategorie" defaultValue={job.subcategorie}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Kies een subcategorie" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currentSubcategories.map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="aantal">Aantal</Label>
                                    <Input id="aantal" name="aantal" type="number" defaultValue={job.aantal} required />
                                </div>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label htmlFor="lengteMm">Lengte (mm)</Label>
                                    <Input id="lengteMm" name="lengteMm" type="number" defaultValue={job.lengteMm} />
                                </div>
                                 <div>
                                    <Label htmlFor="hoogteMm">Hoogte (mm)</Label>
                                    <Input id="hoogteMm" name="hoogteMm" type="number" defaultValue={job.hoogteMm} />
                                </div>
                                 <div>
                                    <Label htmlFor="diepteMm">Diepte (mm)</Label>
                                    <Input id="diepteMm" name="diepteMm" type="number" defaultValue={job.diepteMm} />
                                </div>
                             </div>
                             <div>
                                <Label htmlFor="omschrijvingKlant">Omschrijving voor klant</Label>
                                <Textarea id="omschrijvingKlant" name="omschrijvingKlant" defaultValue={job.omschrijvingKlant} required />
                             </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Materials Tab */}
                <TabsContent value="materials">
                    <Card>
                        <CardHeader>
                            <CardTitle>Materialen</CardTitle>
                            <CardDescription>Voeg de benodigde materialen voor deze klus toe.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Preset selector could go here */}
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Categorie</TableHead>
                                        <TableHead>Naam</TableHead>
                                        <TableHead>Hoeveelheid</TableHead>
                                        <TableHead>Eenheid</TableHead>
                                        <TableHead><span className="sr-only">Actie</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {materials.map(mat => (
                                        <TableRow key={mat.id}>
                                            <TableCell>{mat.materiaalCategorie}</TableCell>
                                            <TableCell>{mat.naam}</TableCell>
                                            <TableCell>{mat.hoeveelheid}</TableCell>
                                            <TableCell>{mat.eenheid}</TableCell>
                                            <TableCell><Button variant="ghost" size="icon"><Trash2 className="w-4 h-4" /></Button></TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Placeholder for adding a new row */}
                                    <TableRow>
                                        <TableCell>
                                            <Select name="new_material_category"><SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger><SelectContent>{materialCategories.map(c => <SelectItem value={c} key={c}>{c}</SelectItem>)}</SelectContent></Select>
                                        </TableCell>
                                        <TableCell><Input placeholder="Materiaalnaam" name="new_material_name" /></TableCell>
                                        <TableCell><Input type="number" placeholder="0" name="new_material_quantity"/></TableCell>
                                        <TableCell>
                                            <Select name="new_material_unit"><SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger><SelectContent>{materialUnits.map(u => <SelectItem value={u} key={u}>{u}</SelectItem>)}</SelectContent></Select>
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm" type="button"><PlusCircle className="mr-2 w-4 h-4"/> Toevoegen</Button>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Extras Tab */}
                <TabsContent value="extras">
                    <Card>
                        <CardHeader>
                            <CardTitle>Extra's</CardTitle>
                            <CardDescription>Voeg extra benodigdheden toe zoals steigers of containers.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <Label htmlFor="steiger-nodig" className="font-semibold">Steiger nodig?</Label>
                                    <p className="text-sm text-muted-foreground">Voeg steigerhuur toe aan de klus.</p>
                                </div>
                                <ToggleLeft className="w-10 h-10 text-muted-foreground cursor-pointer" id="steiger-nodig" />
                            </div>
                             <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <Label htmlFor="container-nodig" className="font-semibold">Container nodig?</Label>
                                    <p className="text-sm text-muted-foreground">Voeg een afvalcontainer toe.</p>
                                </div>
                                <ToggleLeft className="w-10 h-10 text-muted-foreground cursor-pointer" id="container-nodig" />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </form>
      </div>
    </main>
  );
}
