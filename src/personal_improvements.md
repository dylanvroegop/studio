# App Improvements & Bugs Notes

## Wait

- Add in n8n prompt a rule “if unsure add more, not less”
- Add another In the calculator prompt for “notes of the carpenter” in case this is something I missed and they keep adding like “achterhout” toggle button, a separate supabase input. 
- add voorschot instellingen on quote id page tsx
- make versturen also work inside the quote id page.tsx
- make sure the drawings are shown also in a separate page next to 'pdf review'. 
- maybe add some form of way to let them know inside the app ' we can import pricing, 
  call us or email us for information.' this could be a pdf quote, excel, csv, or even their own messy book on paper. it can all be importing into the app, if you give us the correct information, we will import it. etc something like this <<<>>>
- add into the boeiboorden also 'latafstand' and make sure that the 'balkafstand' actually does not produce a 'top balk' and 'bottom' balk, it should just add the beams that are vertical. 
  have on boeiboorden extra drawings that actually give it a 'downside' as well. so this means that the measurement needs to be split up into 2 parts. 'voorzijde' and 'onderzijde'.
  this must be done in the drawing itself, so that the user can see it clearly.
  and that the drawing is one drawing, but its split up into 2 rows. since the drawing mostly is not high for boeiboorden since its mostly '500mm max high' then it perfectly fits 2 drawings. this means the boeiboorden drawing, whatever that is must be a 'new component drawing' just like walldrawing.tsx is. make sure that theres also some form of 'kopkant L or R' add toggle button so they can easily add those as well if needed. 
- make sure all warning sign apply to drawings, for example with ceilling 'balklaag' when 4000mm was filled in, theres no warning when a material of 44x69x3000mm was chosen making this an impossible build. this does NOT apply to 'rachelwerk' in ceillings since that can be shorter.
  this only applies to construction logic where its impossible for example to build a 'balklaag in vloeren' when the breedte of this floor is 3200mm and the '75x200mm balken' are 3000mm long, this makes this impossible since the 3000mm 75x200 balk needs somewhere to rest on.
- [important!!!] change message of wachtwoord vergeten.
- Add profit calculator to the app entirely
- Add to boeiboorden some form of auto calculator with “count pannen, its likely this long” auto search the moment they choose that specific pannen”
- Make sure everything gets stored into firestore instantly and not only on “opslaan” so that when they leave the page, it doesn’t just delete all information.
- Make sure on drawings “kopshout” is shown with diagonal lines
- Add in n8n in the ai agent a function where it stores what the material was used for. For example “plinten afwerking” or something better as description.
- implement options for drawings 'show constructie platen layout' or 'constructie hout' or 'gipsplaten' etc etc. 





--------------------------------------------------------------------------------




## Uncompleted

- For first time users, force to set pdf instellingen pop-up the way they prefer.
- make sure that the 'onder voorbehoud' is also a toggle button, just like the 'voorschot' is.
- Test how you implement rk gips for wanden liggend VS staand in app decision.
- Have notes be separate showing 4 lines of text instead of 1. and fix the text itself.
- make sure the toggle button for 'afval' is bigger in width, so the last 10% is used for clickable to toggle.
- Remove ability to ever in any measurement or number box to hit - or e etc
- Systeem plafond new job type under 'plafonds', make sure to implement a basic mats into job-registry.
- able to export drawings as pdf
- able to expand drawings on phone or desktop. 
- make sure theres some form of better sync with 'done with calculation' on the quotes page. because currently the user might sit there waiting. im not sure how to do that because now we use webhook - calculate - supabase - fetch from supabase. because return webhook is too long, since the calculation happens for 10 minutes maybe. 
- make a 'export material list' 
- make them able to edit total amount on the verbruiks materialen, keeping the list itself but it converts to '% or euro' conversion that they can then fill in. 
- add more information to the 'section_key' so for example the 'balklaag' has things like 'this is a balklaag constructie etc' also adding extra information like 'gebruik hiervoor pluggen 8x100'
- Set new option in automatische berekening on material page for “schatting prijzen” toggle on off
- Route “materiaal berekenen” on overzicht to the quote itself on the quotes page. Even if it’s empty, if not done yet. Show a spinning of “wordt berekend. Maximaal 5 minuten” with a progressbar of 5 minutes
- Verbruikt and groot into one option.
- Leverancier transport kosten
- Duplicate job on overzicht possible.
- Boei delen Firestore “schuine punt dak boeideel” VS “voorzijde recht dak boeideel”
- Add own signature in pdf instellingen
- Fix issue on auto update name indeed quotes.materialen tab. 
In case they change the name to fit a different product and it updates the wrong name. 
For example, user chose;
Gipsplaat ak4 2400x1200x12,5mm
Changed it to;
Gipsplaat ak2 2600x1200x12,5mm 
Since it was more convenient if the ceiling is 2540 in width, that means the product of Gipsplaat ak4 2400x1200x12,5mm now gets updated in their material list to;
Gipsplaat ak2 2600x1200x12,5mm 
In a sense overwriting their originalGipsplaat ak4 2400x1200x12,5mm making that disappear from their list