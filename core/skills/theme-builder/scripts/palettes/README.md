# Archetype Palettes

Pre-validated 15-token starter kits for `/theme-builder`. Each palette ships with all 15 required CSS tokens (contrast-checked), a recommended shape radius set, and suggested font families.

**How to use:** When the user's prompt matches or overlaps one of these archetypes, start from the matching palette and tweak for specificity rather than inventing from scratch. Faster and less likely to fail `check-contrast.cjs` at Phase 2.

**Available palettes:**

- `warm-cozy.json` — warm amber/gold on deep brown. Autumn, cottagecore-warm, tavern, hearth.
- `neon-cyber.json` — hot magenta on near-black blue. Cyberpunk, Y2K, vaporwave-adjacent.
- `dark-noir.json` — crimson on near-black. Noir, ritualistic, grim reaper, traditional Korean.
- `earth-forest.json` — moss green on deep earth. Cottagecore, forest, herbalist, old-library.
- `midnight-space.json` — cool cyan on deep indigo. Space, midnight, ocean depths, cool-tech.
- `pastel-soft.json` — soft lavender/rose on cream. Pastel, kawaii, paper, spring.

Each file has the shape:

```json
{
  "name": "warm-cozy",
  "dark": true,
  "tokens": { "canvas": "#…", …15 keys… },
  "shape": { "radius-base": 6, "radius-round": 16 },
  "fonts": { "suggested-sans": ["Jua", "Nunito"], "suggested-mono": ["JetBrains Mono"] },
  "vibes": ["autumn", "cottagecore-warm", "tavern", "hearth"]
}
```

**Validation:** Every palette here passes all HARD rules. A few have borderline SURFACE warnings (well/edge contrast within 10% of thresholds). Treat palettes as *heuristic starting points*, not frozen final values — always run `check-contrast.cjs --tokens-json <file>` after customizing and widen `well` / `edge` / `edge-dim` toward the panel if any SURFACE rule fails.
