# Repository Guidelines

## Project Structure & Module Organization
- `UmbraServer.ts` is the Bun backend entrypoint; backend services live in `backend/` (`routes/`, `settings/`, `python/`).
- Frontend app code is in `frontend/src/` (React + TypeScript), with shared UI in `frontend/src/components/` and state in `frontend/src/store/`.
- Built frontend assets are served from `public/`.
- Runtime data lives in `User/` (outputs, presets, downloaded user models); ComfyUI model assets live under `Tools/ComfyUI/models`.
- Third-party tool integrations are vendored in `Tools/` (for example `Tools/ComfyUI` and dataset helpers).
- Planning docs are in `docs/plan/`.

## Build, Test, and Development Commands
- `bun install`: install root and workspace dependencies.
- `bun run dev:fullstack`: run the Bun backend (`:8212`) plus Bun frontend rebuild watcher; serve the app from `http://localhost:8212`.
- `bun run dev:backend`: run only the API/backend server.
- `bun run build:frontend`: create production frontend build.
- `cd frontend && bun run lint`: run ESLint for frontend code.
- `bun run test-sqlite.ts` or `bun run test-better-sqlite.ts`: SQLite smoke checks.

## Coding Style & Naming Conventions
- Language: TypeScript first; use ES modules.
- Indentation: 2 spaces; keep semicolon/style consistent with surrounding file.
- Components/classes: `PascalCase` (`LibraryPanel.tsx`), variables/functions: `camelCase`, constants: `UPPER_SNAKE_CASE` when truly constant.
- Keep backend route handlers focused; move reusable logic into `backend/*Service`-style modules.
- Run `cd frontend && bun run lint` before opening a PR.

## Testing Guidelines
- No unified automated suite is configured yet; use targeted smoke checks plus manual UI verification.
- Add tests next to new logic where practical (for example `*.test.ts` in feature folders).
- For backend/data changes, verify startup and affected API routes locally.
- For frontend changes, verify impacted flows in `dev:fullstack` mode and check browser console for warnings.

## ComfyUI Lifecycle
- Umbra Studio exclusively owns the bundled ComfyUI lifecycle. The active install is `Tools/ComfyUI`, using its tool-local `venv`.
- Start ComfyUI from Umbra's ComfyUI workspace Launch control. For automated validation, use Umbra's managed backend API only after Umbra is running.
- Treat `comfyui-mcp` as a client of the already-running server at `http://127.0.0.1:8188`.
- Never use MCP `start_comfyui`, `stop_comfyui`, `restart_comfyui`, or installer tools for this project. Never launch ComfyUI Desktop/Electron or let MCP auto-detect another installation.
- Do not run `Tools/ComfyUI/main.py` directly unless the user explicitly requests standalone diagnosis. Normal development and validation must preserve Umbra's process ownership.

## Commit & Pull Request Guidelines
- Use clear, scoped commit messages: `feat(frontend): add keyboard navigation`, `fix(backend): handle missing metadata`.
- Keep commits focused and reviewable; avoid mixing refactors with behavior changes.
- PRs should include: summary, affected areas, validation steps, and screenshots/GIFs for UI changes.
- Do not commit local runtime/state artifacts from `User/`, model binaries from `User/Models` or `Tools/ComfyUI/models`, or generated build output unless explicitly required.

## Publishing Policy
- Treat published updates as patch version bumps unless the user explicitly requests a local no-bump build.
- Bump the version exactly once before building Windows and Linux packages; tagged CI uses the no-bump packagers because source is already versioned.
- Update `CHANGELOG.md`, validate both archives, then use the same version for the commit, tag, and GitHub release.
