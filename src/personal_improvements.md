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

## [DONE] Kozijnen toggle for 'complete set' vs 'zelf gemaakt'
type: feature
page: kozijnen
description: Add simple toggle to indicate if kozijn is bought as complete set or custom made
---

## [DONE] Favorieten in materialen
type: feature
page: materialen
description: Allow user to mark materials as favorites for quick access
---

## [DONE] Vensterbanken toggle voor raamkozijn
type: feature
page: measurement
description: Add toggle in measurement for windowsill (vensterbank)
---

## [DONE] More space between openings on drawing
type: ux
page: measurement
description: Opening measurements on the wall drawing are too close together, add spacing
---

## [DONE] Numbers in one line on drawing
type: ux
page: measurement
description: Make sure all dimension numbers fit on one line if possible
---

## [DONE] Notities doubled on measurement and materialen page
type: bug
page: measurement, materialen
description: Notifications/notes are showing twice, fix duplication
---


## [DONE] Make dubbele stijl just a 'toggle' button instead of the dropdownbox on the measurement page. the toggle includes 'both' sides when turned on.
type: ux
page: measurement
description: Change dubbele stijl from dropdown to toggle button. When toggled on, it should include both sides.
---


## [DONE] Persist Klein Materiaal visibility
type: ux
page: materialen
description: for the 'klein materiaal' hide button, make sure that if the user clicks this once based on their userid. it gets stored as 'hidden' forever across all pages. so it never shows up again unless the user manually unhides it.






## [DONE] Implement auto vensterbank lengte shown
type: ux
page: measurement
description: Display calculated total length for vensterbank

## [DONE] Vensterbank toggle off when no overlap selected
type: bug
page: measurement
description: Reset vensterbank to off if opening type is not window