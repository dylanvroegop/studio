export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Calvora</p>
          <h1 className="mt-2 text-3xl font-semibold">Privacyverklaring</h1>
          <p className="mt-2 text-sm text-muted-foreground">Laatst bijgewerkt: 23 augustus 2026</p>
        </div>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Welke gegevens verwerkt Calvora?</h2>
          <p>Calvora verwerkt gegevens die nodig zijn om de applicatie te leveren, zoals accountgegevens, offerte- en klantgegevens, materiaalgegevens en gebruiksgegevens.</p>
          <p>Als je een bankrekening koppelt, verwerkt Calvora de door jou gedeelde rekeninginformatie, saldi en transacties. Deze gegevens worden gebruikt voor het bankoverzicht, uitgavenanalyses en administratieve functies.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Waarom verwerken we deze gegevens?</h2>
          <p>We gebruiken de gegevens om Calvora beschikbaar te maken, je gegevens veilig aan jouw account te koppelen, banktransacties te tonen en de functies te verbeteren. We verkopen persoonsgegevens niet.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Dienstverleners</h2>
          <p>Voor hosting, authenticatie, opslag en bankkoppelingen kan Calvora gebruikmaken van gespecialiseerde dienstverleners, waaronder Firebase, Supabase en Enable Banking. Zij krijgen alleen toegang voor zover dat nodig is om de dienst te leveren.</p>
        </section>

        <section className="space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Jouw rechten en contact</h2>
          <p>Je kunt vragen om inzage, correctie of verwijdering van jouw persoonsgegevens. Je kunt een bankkoppeling ook vanuit Calvora beëindigen. Neem hiervoor contact op via <a className="underline" href="mailto:vroegoptimmerwerken@gmail.com">vroegoptimmerwerken@gmail.com</a>.</p>
          <p>Deze verklaring kan worden aangepast wanneer Calvora verandert. De datum bovenaan laat zien wanneer de verklaring voor het laatst is bijgewerkt.</p>
        </section>
      </article>
    </main>
  );
}
