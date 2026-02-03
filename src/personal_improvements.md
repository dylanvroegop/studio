# App Improvements & Bugs Notes


- [WAIT] Add in n8n prompt a rule “if unsure add more, not less”

- [WAIT] Add another In the calculator prompt for “notes of the carpenter” in case this is something I missed and they keep adding like “achterhout” toggle button, a separate supabase input. 

- [WAIT] add voorschot instellingen on quote id page tsx

- [WAIT] make versturen also work inside the quote id page.tsx

- [WAIT] make sure the drawings are shown also in a separate page next to 'pdf review'. 

- [wait] maybe add some form of way to let them know inside the app ' we can import pricing, 
call us or email us for information.' this could be a pdf quote, excel, csv, or even their own messy book on paper. it can all be importing into the app, if you give us the correct information, we will import it. etc something like this <<<>>>

- [WAIT] add into the boeiboorden also 'latafstand' and make sure that the 'balkafstand' actually does not produce a 'top balk' and 'bottom' balk, it should just add the beams that are vertical. 
have on boeiboorden extra drawings that actually give it a 'downside' as well. so this means that the measurement needs to be split up into 2 parts. 'voorzijde' and 'onderzijde'.
this must be done in the drawing itself, so that the user can see it clearly.
and that the drawing is one drawing, but its split up into 2 rows. since the drawing mostly is not high for boeiboorden since its mostly '500mm max high' then it perfectly fits 2 drawings. this means the boeiboorden drawing, whatever that is must be a 'new component drawing' just like walldrawing.tsx is. make sure that theres also some form of 'kopkant L or R' add toggle button so they can easily add those as well if needed. 

- [DONE] make sure the ceillingdrawing has its 'raveling balken' correctly added when the opening is placed. so the opening doesnt just float in the air with no beams supporting it.

- add a quick 'switch measurements' inside the measurement page. for example in between the 2 boxes 'lengte and breedte' a simple switch toggle. 

- remove instalatie & elektra, and schakelmateriaal from all job-registry.

- make gordijnkoof and leidingkoof into 1 'toevoegen' when its placed inside a job type, just like 'ceilling' then once they click '+ koof toevoegen' it opens up to choose between these 2.

- hiding the 'automatische klein materiaal berekening' still does not seem to fully work. if i actually hide it, then it doesnt stay hidden across the entire job type app. i want this to be fully 'hidden' forever, on all pages its located on if they click it once. same goes if they undo it.

- on the dashboard it currently does not give the 'price' when in fact inside the quote[id]page.tsx it actually was calculated already. 

- when i accidentally click a card in the material page it openns up the selectionmaterialmodal, but when i didnt add anything since i misclicked, it still s eems to add a 'empty state' im not sure this is also in firestore stored now as empty, but the 'green' as if it was filled in inside the app itself is wrong. they should be able to misclick and click out of the selectionmaterialmodal to then actually not have a green line as if it was filled in causing confusion for the user.

- [wait] make sure all warning sign apply to drawings, for example with ceilling 'balklaag' when 4000mm was filled in, theres no warning when a material of 44x69x3000mm was chosen making this an impossible build. this does NOT apply to 'rachelwerk' in ceillings since that can be shorter.
this only applies to construction logic where its impossible for example to build a 'balklaag in vloeren' when the breedte of this floor is 3200mm and the '75x200mm balken' are 3000mm long, this makes this impossible since the 3000mm 75x200 balk needs somewhere to rest on.


- set a limit on 'fill in measurement numbers' so it doesnt crash. 

- fix how 'maatwerk' is stored inside the firestore, also for components.
make sure this always has the same 'name' or is stored inside a single 'maatwerk' object.
within this maatwerk, there could be multiple 'maatwerk' items, but they all need to be stored inside this single object and a 'key' can be stored such as for the 'leidingkoof' the key would be stored inside 'maatwerk'. so that 'maatwerk' stores all measurements inside a single map of firestore inside the 'specific klussen'. if there are multiple klussen types, then it may be stored inside that other klustype but still under the same name 'maatwerk'. 

- add wachtwoord vergeten

- fix geen eigenaar gevonden if they leave before the client add page

- show the 'currently picked' inside the material selection modal

- fix popup at 'materiaal lijst maken' on the overzicht page. issues here.


## 2026-01-30
- Add profit calculator to the app entirely
- Make a professional email with “proposition on how I solve this problem”
- Voeg een mirror button voor boei boorden voor als ze 2 zijde hetzelfde hebben.
- Voeg na opslaan op materialen pagina een snelle “deze heeft geen prijs, voeg toe?” Met een lijst van die materialen. Wordt automatisch opgeslagen in het prijzen bestand.
- Have latafstand also hidden forever in fire tore stored so the user doesn’t have to keep clicking this.
- Add to boeiboorden some form of auto calculator with “count pannen, its likely this long” auto search the moment they choose that specific pannen”
- Make sure everything gets stored into firestore instantly and not only on “opslaan” so that when they leave the page, it doesn’t just delete all information.
- Make sure on drawings “kopshout” is shown with diagonal lines

## 2026-01-31
- make sure the Fout: Failed to fetch quote data Terug naar Dashboard is different, this is not okay for the user. make sure that even if no return was made, the user still sees everything, but just fully blank.
- Make it so the user has the function to add their logo onto the pdf quote
- Make pdf on the quote page the first page they land on.
- Add hide toggle still “add” so for example they fill in the “beplating” any constructie or afwerkplaat, then this must show the same way on the measurement page “hoh 600mm” this way if it’s always the same they can simply hide that forever and focus on things that matter. Make sure that the hide toggle is on/off always and not just per job. If another job has the same “beplating” and is hidden but has no preset materials filled in there, make it expand.
- For first time users, force to set pdf instellingen pop-up the way they prefer.
- In the price edit pop-up, make sure there is another option to fill out “sold per amount quantity”

## 2026-02-01
- Switch measurement page and the material page, then they are still able to go next after the measurement page but this should show instantly “measurement missing”
- Add voorschot option in quote
- Onder voorbehoud option for quote

## 2026-02-02
- Test how you implement rk gips for wanden liggend VS staand in app decision.
- Have notes be separate showing 4 boxes, and an add button.
