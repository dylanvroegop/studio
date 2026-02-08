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

- [DONE] rename 'leidingkoof' to just 'koof' and then delete gordijnkoof fully. 

- [wait] make sure all warning sign apply to drawings, for example with ceilling 'balklaag' when 4000mm was filled in, theres no warning when a material of 44x69x3000mm was chosen making this an impossible build. this does NOT apply to 'rachelwerk' in ceillings since that can be shorter.
this only applies to construction logic where its impossible for example to build a 'balklaag in vloeren' when the breedte of this floor is 3200mm and the '75x200mm balken' are 3000mm long, this makes this impossible since the 3000mm 75x200 balk needs somewhere to rest on.

- [WAIT] [important!!!] change message of wachtwoord vergeten.

- [DONE] fix geen eigenaar gevonden if they leave before the client add page

- [DONE] show the 'currently picked' inside the material selection modal, making it moving to the 'top' of the list in a green colour. even above the favorites.

- [DONE] fix popup at 'materiaal lijst maken' on the overzicht page. issues here.


## 2026-01-30
- [wait] Add profit calculator to the app entirely
- [wait] Add to boeiboorden some form of auto calculator with “count pannen, its likely this long” auto search the moment they choose that specific pannen”
- [wait] Make sure everything gets stored into firestore instantly and not only on “opslaan” so that when they leave the page, it doesn’t just delete all information.
- [wait] Make sure on drawings “kopshout” is shown with diagonal lines

## 2026-01-31
- [DONE] make sure the Fout: Failed to fetch quote data Terug naar Dashboard is different, this is not okay for the user. make sure that even if no return was made, the user still sees everything, but just fully blank.
- [DONE] Make it so the user has the function to add their logo onto the pdf quote
- For first time users, force to set pdf instellingen pop-up the way they prefer.
- In the price edit pop-up, make sure there is another option to fill out “sold per amount quantity” make it a tiny column after the price. just like on the quotes[id] page is done under the materialen section. shows price column, then the aantal dropdown box.

- make sure that the 'onder voorbehoud' is also a toggle button, just like the 'voorschot' is.
- there must be some form of settings for 'voorschot'


## 2026-02-02
- Test how you implement rk gips for wanden liggend VS staand in app decision.
- Have notes be separate showing 4 boxes, and an add button.

- make sure the toggle button for 'afval' is bigger in width, so the last 10% is used for clickable to toggle.
- Remove ability to ever in any measurement or number box to hit - or e etc
- [wait] Add in n8n in the ai agent a function where it stores what the material was used for. For example “plinten afwerking” or something better as description.

## 2026-02-06
- Systeem plafond new job type under 'plafonds', make sure to implement a basic mats into job-registry.


- [wait] implement options for drawings 'show constructie platen layout' or 'constructie hout' or 'gipsplaten' etc etc. 
- able to export drawings as pdf
- able to expand drawings on phone or desktop. 
