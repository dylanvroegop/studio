# App Improvements & Bugs Notes

Format per item:
```
## [priority] Title
type: bug | feature | ux
page: where in the app
description: what needs to happen
---
```

---

## [WAIT] [laag] Balk hoogte tip op material page
type: ux
page: materialen
description: Add a 'tip' that warns user about beam height. Include a 'yes' button that automatically searches and selects the nearest beam height (e.g., if wall is 3100mm and beams are 3000mm, suggest 3300mm/330cm beams instead).
---

## [DONE] Remove duplicate header on measurement page
type: ux
page: measurement
description: Header shows double, remove one
---

## [DONE] Kozijnen without materials should not calculate
type: bug
page: materialen
description: If kozijn is on measurement page but nothing filled in material page, AI agent should skip it. Change n8n prompt.
---

## [laag] Kozijnen toggle for 'complete set' vs 'zelf gemaakt'
type: feature
page: kozijnen
description: Add simple toggle to indicate if kozijn is bought as complete set or custom made
---

## [laag] Favorieten in materialen
type: feature
page: materialen
description: Allow user to mark materials as favorites for quick access
---

## [medium] Vensterbanken toggle voor raamkozijn
type: feature
page: measurement
description: Add toggle in measurement for windowsill (vensterbank)
---

## [laag] More space between openings on drawing
type: ux
page: measurement
description: Opening measurements on the wall drawing are too close together, add spacing
---

## [medium] Numbers in one line on drawing
type: ux
page: measurement
description: Make sure all dimension numbers fit on one line if possible
---

## [hoog] Notities doubled on measurement and materialen page
type: bug
page: measurement, materialen
description: Notifications/notes are showing twice, fix duplication
---