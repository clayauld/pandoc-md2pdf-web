# Pandoc Markdown → PDF Web UI

A tiny drag-and-drop web UI that converts Markdown to PDF using Pandoc/XeLaTeX. Optional watermark support (with customizable text) via LaTeX `draftwatermark`.

License: AGPL-3.0-only (see `LICENSE`).

### Features
- Minimal single-page UI (static assets served by the backend)
- Converts `.md` → `.pdf` using Pandoc with XeLaTeX
- Optional watermark toggle with custom text (defaults to "DRAFT")
- Sensible defaults: letter paper, 1" margins, `Libertinus` font family, paragraph skip
- 10MB upload limit, per-request temp isolation, filename sanitization
- Health endpoint for container orchestration

## Quick start (Docker)

```bash
# Build and run locally
docker compose up --build
# Open the UI
xdg-open http://localhost:8080 || open http://localhost:8080
```

- For local dev hot-reload mounts, use the override:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

### Run without compose
```bash
docker run --rm -p 8080:8080 ghcr.io/clayauld/pandoc-md2pdf-web:latest
```

## How to use (UI)
- Drop or upload a `.md` file in the page.
- Optionally enable “Apply watermark” and set Watermark Text.
- The server returns the generated PDF as a download.

## REST API

### POST `/convert`
- Content-Type: `multipart/form-data`
- Fields:
  - `file` (required): Markdown file
  - `watermark` (optional): `true`/`false` (case-insensitive); default `false`
  - `watermarkText` (optional): string; defaults to `DRAFT` if `watermark=true`

Responses:
- 200 application/pdf (streamed attachment)
- 400 `{ error }` if no file
- 500 `{ error, details }` if conversion fails

Example with curl:
```bash
curl -fSL \
  -X POST 'http://localhost:8080/convert' \
  -F 'file=@README.md;type=text/markdown' \
  -F 'watermark=true' \
  -F 'watermarkText=INTERNAL'
  -o output.pdf
```

### GET `/healthz`
Returns `{ ok: true }` for liveness checks.

## Configuration

- Environment variables:
  - `PORT` (default `8080`)
  - `NODE_ENV` (`production`/`development`)
- Default Pandoc/XeLaTeX options (see `server/index.js`):
  - `--pdf-engine=xelatex`
  - `-V geometry:margin=1in`
  - `-V papersize:letter`
  - `-V mainfont=Libertinus Serif`
  - `-V monofont=Libertinus Mono`
  - `--variable=documentclass:article`
  - `--variable=parskip:12pt`
- Line breaks: `linebreaks.lua` converts HTML `<break>` to a Pandoc line break
- Watermark: if enabled, a `watermark.tex` header is injected using `draftwatermark`

## Fonts
- The image installs `fontconfig` and will copy any fonts from `server/fonts` into `/usr/local/share/fonts/custom` at build time, then refresh the cache.
- Prefer OTF/TTF fonts. If you use non-default families, update `-V mainfont="..."` and `-V monofont="..."` in `server/index.js`.

## Project layout
- `public/`: static single-page UI
- `server/`: Node.js Express backend (uploads + Pandoc invocation)
- `convert_to_pdf.sh`, `linebreaks.lua`, `watermark.tex`: conversion assets
- `Dockerfile`, `docker-compose.yml`, `docker-compose.override.yml`: containerization

## Development
- Node 20+ is installed in the container; dependencies are installed at build.
- Logs: `docker compose logs -f web`
- Hot reloading: the override compose file bind-mounts `public/` and `server/` (and keeps container `node_modules`).

## Troubleshooting
- Fonts not applied: ensure your custom fonts are under `server/fonts` at build time or mounted inside the container, then refresh the cache (the Dockerfile runs `fc-cache`). Ensure the font family names match what XeLaTeX expects.
- Missing LaTeX packages: the image includes `texlive-latex-extra`, but some documents may require additional TeX packages. Extend the Dockerfile to install what's needed.
- Conversion fails: check container logs. Large/complex documents or unusual Unicode may need additional fonts or LaTeX packages.
- Architecture: the published image and compose example target `linux/amd64`.

## Security notes
- Uploads are limited to ~10MB and isolated per-request in a temp dir.
- Only `.md` (plus text/plain) is accepted; filename is sanitized.
- Temporary work directories are best-effort removed after response is sent.

## License
AGPL-3.0-only. Contributions are welcome under the same license.
