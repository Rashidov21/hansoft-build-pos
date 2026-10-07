# Versioning and release builds

## Files

| File | Purpose |
|------|---------|
| `VERSION` | Semantic version (`1.0.0`) — edit manually for releases |
| `version.lock.json` | Auto-incrementing **build number** and last build metadata (committed) |
| `frontend/public/build-info.json` | Generated at build; copied into installer |
| `frontend/src/generated/build-info.ts` | Generated TypeScript constants for UI |
| `dist/releases/<version>+<build>/` | Archived installers + `release-manifest.json` |
| `dist/releases/LATEST.txt` | Name of the last staged release folder |

## Production build

```powershell
npm run build:production
```

Each run:

1. Increments `version.lock.json` → `build`
2. Syncs version into `Cargo.toml`, `frontend/package.json`, build-info files
3. Builds sidecar, frontend, Tauri MSI/NSIS
4. Copies installers to `dist/releases/1.0.0+<build>/`

Incremental rebuild (skip clean + npm install):

```powershell
npm run build:production:fast
```

## Bump semver (optional)

```powershell
npm run version:bump:patch   # 1.0.0 → 1.0.1
npm run version:bump:minor
npm run version:bump:major
```

Then run `build:production` — build counter still increments.

## UI

Settings → **About / version** shows `fullVersion` (e.g. `1.0.0+12`) and build time when available.

## Legacy script

`build_and_deploy.ps1` calls the same sync/stage scripts; prefer `npm run build:production`.
