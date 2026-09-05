# HerdHarbor v1.7.5 Health Intelligence modal hotfix

This hotfix corrects the Health Intelligence form placement and visibility issue reported on the Health page.

## Problems corrected

- Health episode forms could render low in the document flow instead of as an obvious foreground dialog.
- The form could be partially off-screen or clipped, making Start health episode appear unresponsive.
- The form inherited legacy generic modal positioning rules that conflicted with the Health Intelligence layout.

## Fix

- force Health Intelligence dialogs into a fixed, full-viewport overlay
- center the dialog in the active viewport at desktop sizes
- use a contained scroll area inside the dialog for long health forms
- collapse the form to a single column on smaller screens
- reset modal scroll position to the top whenever it opens
- focus the visible dialog without forcing page scroll or opening a mobile keyboard
- lock background page scrolling while a health dialog is open
- restore background scrolling when the dialog closes
- allow Escape to close the Health Intelligence dialog
- cache-bust the HerdHarbor build loader and rotate the service-worker cache so clients receive the repair

The existing Health Intelligence data model, health records, care records, assessments, and safety logic are unchanged.
