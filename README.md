# Pandoc Markdown → PDF Web UI

A tiny drag-and-drop web UI that converts Markdown to PDF using Pandoc/XeLaTeX. Optional watermark support via `watermark.tex`.

License: AGPL-3.0-only (see `LICENSE`).

## Quick start (Docker)

```bash
# build and run
docker compose up --build
# open the UI
xdg-open http://localhost:8080 || open http://localhost:8080
```

- For local dev hot-reload mounts, use the override:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

## Usage
- Drop or upload a `.md` file in the UI.
- Check “Apply watermark” to include `watermark.tex`.
- The server returns the generated PDF as a download.

## Fonts
- The image installs `fontconfig` and will copy any fonts from `server/fonts` into `/usr/local/share/fonts/custom` at build time, then refresh the cache.
- Prefer OTF/TTF fonts. If you use non-default families, update `-V mainfont="..."` and `-V monofont="..."` in `server/index.js`.

## Project layout
- `public/`: static single-page UI
- `server/`: Node.js Express backend (uploads + Pandoc invocation)
- `convert_to_pdf.sh`, `linebreaks.lua`, `tables.lua`, `watermark.tex`: conversion assets
- `Dockerfile`, `docker-compose.yml`, `docker-compose.override.yml`: containerization

## Development
- Node 20+ in the container; dependencies installed at build.
- Logs: `docker compose logs -f web`

## Security notes
- Uploads are limited to ~10MB and isolated per-request in a temp dir.
- Only `.md` accepted (plus text/plain), filename sanitized.

## License
AGPL-3.0-only. Contributions are welcome under the same license.
