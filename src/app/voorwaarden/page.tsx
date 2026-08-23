export default function VoorwaardenPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Calvora</p>
          <h1 className="mt-2 text-3xl font-semibold">Algemene voorwaarden</h1>
          <p className="mt-2 text-sm text-muted-foreground">Laatst bijgewerkt: 23 augustus 2026</p>
        </div>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Gebruik van Calvora</h2>
          <p>Calvora is software voor offerte-, planning- en administratieprocessen voor bouw- en timmerbedrijven. Je bent verantwoordelijk voor de juistheid van de gegevens die je invoert en voor het veilig houden van je account.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Bankkoppelingen</h2>
          <p>Een bankkoppeling wordt alleen gestart nadat jij daarvoor toestemming geeft bij je bank. Je kunt de toestemming beëindigen via Calvora of je bank. Calvora is geen bank en de uitgavenanalyse is geen fiscaal, juridisch of financieel advies.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Beschikbaarheid en wijzigingen</h2>
          <p>We proberen Calvora betrouwbaar beschikbaar te maken, maar onderhoud, storingen en wijzigingen bij externe dienstverleners kunnen tijdelijk invloed hebben op de beschikbaarheid of actualiteit van gegevens.</p>
          <p>We kunnen functies en deze voorwaarden aanpassen wanneer de dienst of wetgeving verandert. De actuele versie staat op deze pagina.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Contact</h2>
          <p>Vragen over deze voorwaarden kun je sturen naar <a className="underline" href="mailto:vroegoptimmerwerken@gmail.com">vroegoptimmerwerken@gmail.com</a>.</p>
        </section>
      </article>
    </main>
  );
}
