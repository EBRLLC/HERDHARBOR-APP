# HerdHarbor v1.7.5 interaction hotfix

## Root cause

The production interaction lock was not caused by the v1.7.5 workflow engine itself. The v1.7.1 stability hotfix installed a document-wide MutationObserver that scheduled `patchCurrentDom()` through `queueMicrotask()` after every child-list mutation. Several DOM patches can themselves create child-list mutations, including symptom urgency label normalization and other dynamic UI patches. That allowed the observer to observe its own patch work repeatedly and starve normal user interaction.

## Repair

The observer now batches work to the next animation frame, disconnects before running `patchCurrentDom()`, and reconnects afterward. Mutations created by the patch pass therefore cannot recursively schedule another patch pass.

The repaired stability runtime is cache-busted as `herdharbor-v1.7.1-stability-hotfix.js?v=2`, and the PWA shell cache uses the `dom-observer-recovery-1` identity.

The v1.7.5 workflow engine remains disabled from browser startup until browser-level interaction coverage is available.
