# TODO

- [x] Named furniture pieces: every piece needs a name, shown on the canvas so pieces are recognisable even when the sketch isn't
- [x] Furniture packs: export some or all of the library to a file and import someone else's pack (e.g. share with a partner so they can play with the same furniture)
- [x] Named floorplans: a floorplan must be named when it's imported
- [ ] Tab bar for switching between floorplans (replacing the dropdown in the top bar)
- [ ] Import floorplans from PDF (many listings only offer a PDF)
- [ ] Investigate janky drawing in the furniture editor. Suspects:
  - ~~Quick strokes lost their last points (pen-up read stale React state)~~ fixed; the in-progress stroke is now tracked in a ref
  - Every pointer move does a React state update and re-renders the whole SVG; batch points with requestAnimationFrame or draw the in-progress stroke on a canvas/ref outside React
  - The in-progress stroke's outline is recomputed from all its points on every move (perfect-freehand `getStroke`), which gets slower as a stroke gets longer
  - `streamline`/`smoothing` settings may add visible lag behind the Pencil tip
  - Check coalesced events and pressure handling on iPad (`getCoalescedEvents`, pressure 0 at stroke start)
- [ ] Update the rotation snapping logic (details to be decided)
- [ ] Placement priority: sort the "Left to place" list so big pieces come before rugs, chairs, etc. (by size, or a priority set per piece)
- [ ] Layer order for placed furniture: bring forward / send backward / bring to front / send to back (e.g. a rug under a table)
