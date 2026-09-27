# Floorplan Furnisher

Try out furniture layouts on real floorplans from property listings.

- Import a floorplan image and set its scale by drawing a line over a known dimension
- Build a library of your furniture with real dimensions, counts and Apple Pencil sketches
- Drag pieces onto the plan, rotate them, and see what's left to place
- Share furniture packs with someone else; measure anything on the plan

Everything is stored in your browser (IndexedDB) — nothing is uploaded anywhere.

## Development

```sh
npm install
npm run dev     # also reachable from other devices on your network (e.g. an iPad)
npm run build
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## License

All rights reserved. See [LICENSE](LICENSE) — this code is public for viewing only.
