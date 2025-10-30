# 📄 Pandoc Markdown → PDF Web UI

A simple, drag-and-drop web application that converts Markdown files to beautifully formatted PDFs. Perfect for generating professional documents, reports, documentation, and more from your Markdown files.

**License**: AGPL-3.0-only (see `LICENSE`)

---

## 📑 Table of Contents

- [What is This?](#what-is-this)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start Guide](#quick-start-guide)
- [Using the Web Interface](#using-the-web-interface)
- [REST API Usage](#rest-api)
- [Configuration Options](#configuration)
- [Font Customization](#fonts)
- [Development Setup](#development)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [Project Structure](#project-layout)
- [License](#license)

---

## 🎯 What is This?

This tool provides a user-friendly web interface for converting Markdown (`.md`) files into professional PDF documents. Instead of manually running command-line tools, simply drag and drop your Markdown file into a browser, and get a formatted PDF in seconds.

**Use Cases:**
- Generate PDF reports from Markdown documentation
- Create professional-looking documents without LaTeX knowledge
- Add "DRAFT" or custom watermarks to documents
- Automate document generation via REST API
- Convert technical documentation to PDF format

**How It Works:**
Under the hood, this uses [Pandoc](https://pandoc.org/) with XeLaTeX to handle the conversion, providing high-quality typesetting and font support.

---

## ✨ Key Features

- 🖱️ **Simple Drag-and-Drop UI** - No command line required
- 📝 **Markdown to PDF Conversion** - High-quality output using Pandoc/XeLaTeX
- 🏷️ **Optional Watermarks** - Add "DRAFT" or custom text watermarks
- 🎨 **Beautiful Typography** - Professional Libertinus font family included
- ⚡ **Fast & Lightweight** - Minimal Docker container, quick startup
- 🔒 **Secure** - 10MB file limit, isolated temporary directories per request
- 🌐 **REST API** - Integrate with scripts, CI/CD, or other applications
- ❤️ **Health Checks** - Built-in endpoint for container monitoring

**Default PDF Styling:**
- Letter-sized paper (8.5" × 11")
- 1-inch margins on all sides
- Libertinus Serif for body text
- Libertinus Mono for code blocks
- Paragraph spacing for readability

---

## 📋 Prerequisites

**To run this application, you need:**

- **Docker** (recommended) - [Install Docker](https://docs.docker.com/get-docker/)
  - Docker Desktop for Windows/Mac
  - Docker Engine for Linux
- **OR** Docker Compose (included with Docker Desktop)

**That's it!** All other dependencies (Pandoc, LaTeX, fonts, Node.js) are bundled in the Docker image.

**Checking if Docker is installed:**
```bash
docker --version
docker compose version
```

---

## 🚀 Quick Start Guide

### Method 1: Using Docker Compose (Recommended)

This is the easiest way to get started:

1. **Clone or download this repository**
```bash
git clone https://github.com/clayauld/pandoc-md2pdf-web.git
cd pandoc-md2pdf-web
```

2. **Start the application**
```bash
docker compose up --build
```

3. **Open your browser**
   - Navigate to: http://localhost:8080
   - You should see the upload interface

4. **Stop the application**
   - Press `Ctrl+C` in the terminal
   - Or run: `docker compose down`

### Method 2: Using Pre-built Image

Skip the build process and use the published Docker image:

```bash
docker run --rm -p 8080:8080 ghcr.io/clayauld/pandoc-md2pdf-web:latest
```

Then open http://localhost:8080 in your browser.

### Method 3: For Developers (Hot Reload)

If you're modifying the code and want automatic reloading:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

This mounts your local `public/` and `server/` directories into the container, so changes are reflected immediately.

---

## 💻 Using the Web Interface

### Step-by-Step Instructions

1. **Open the application** in your browser (http://localhost:8080)

2. **Upload your Markdown file** by either:
   - Dragging and dropping a `.md` file onto the page
   - Clicking the upload area to browse for a file

3. **Configure watermark (optional)**:
   - Toggle the "Apply watermark" checkbox
   - Enter custom watermark text (defaults to "DRAFT")
   - Watermarks appear diagonally across each page

4. **Click "Convert to PDF"**
   - The conversion happens on the server
   - Your browser will download the PDF automatically
   - The PDF has the same base filename as your Markdown file

5. **Open the PDF** in your favorite PDF viewer

### Example Use Case

Let's say you have a file named `meeting-notes.md`:

```markdown
# Meeting Notes - Q4 Planning

## Attendees
- Alice (Engineering)
- Bob (Product)

## Discussion Points
- Feature roadmap for next quarter
- Resource allocation
```

1. Upload `meeting-notes.md`
2. Enable watermark with text "DRAFT"
3. Download `meeting-notes.pdf` with a professional layout and diagonal "DRAFT" watermark

---

## 🌐 REST API Usage

The application provides a REST API for programmatic access, perfect for automation, CI/CD pipelines, or integrating into other applications.

### POST `/convert` - Convert Markdown to PDF

**Endpoint**: `http://localhost:8080/convert`

**Request Format**: `multipart/form-data`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file` | File | ✅ Yes | - | Your Markdown (`.md`) file |
| `watermark` | Boolean | No | `false` | Enable watermark (`true` or `false`) |
| `watermarkText` | String | No | `DRAFT` | Custom watermark text (only used if `watermark=true`) |

**Response**:

| Status Code | Content-Type | Description |
|-------------|--------------|-------------|
| 200 | `application/pdf` | Successfully converted PDF file |
| 400 | `application/json` | Missing or invalid file: `{ "error": "message" }` |
| 500 | `application/json` | Conversion failed: `{ "error": "message", "details": "..." }` |

### Examples

#### Example 1: Basic Conversion (using curl)

```bash
curl -X POST 'http://localhost:8080/convert' \
  -F 'file=@my-document.md' \
  -o my-document.pdf
```

#### Example 2: With Custom Watermark

```bash
curl -X POST 'http://localhost:8080/convert' \
  -F 'file=@proposal.md' \
  -F 'watermark=true' \
  -F 'watermarkText=CONFIDENTIAL' \
  -o proposal.pdf
```

#### Example 3: Using Python (requests library)

```python
import requests

# Prepare the file and form data
with open('document.md', 'rb') as f:
    files = {'file': ('document.md', f, 'text/markdown')}
    data = {
        'watermark': 'true',
        'watermarkText': 'INTERNAL USE ONLY'
    }
    
    # Make the request
    response = requests.post(
        'http://localhost:8080/convert',
        files=files,
        data=data
    )
    
    # Save the PDF
    if response.status_code == 200:
        with open('document.pdf', 'wb') as pdf:
            pdf.write(response.content)
        print('✅ PDF generated successfully!')
    else:
        print(f'❌ Error: {response.json()}')
```

#### Example 4: Using JavaScript (Node.js with axios)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function convertToPDF() {
  const form = new FormData();
  form.append('file', fs.createReadStream('document.md'));
  form.append('watermark', 'true');
  form.append('watermarkText', 'DRAFT');

  try {
    const response = await axios.post('http://localhost:8080/convert', form, {
      headers: form.getHeaders(),
      responseType: 'stream'
    });
    
    response.data.pipe(fs.createWriteStream('document.pdf'));
    console.log('✅ PDF generated successfully!');
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

convertToPDF();
```

### GET `/healthz` - Health Check

**Endpoint**: `http://localhost:8080/healthz`

**Purpose**: Check if the service is running (useful for container orchestration, monitoring, load balancers)

**Response**:
```json
{
  "ok": true
}
```

**Example**:
```bash
curl http://localhost:8080/healthz
# Returns: {"ok":true}
```

---

## ⚙️ Configuration Options

### Environment Variables

You can customize the application behavior using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the web server listens on |
| `NODE_ENV` | `production` | Set to `development` for verbose logging |

**Example: Running on a different port**
```bash
docker run --rm -p 3000:3000 -e PORT=3000 ghcr.io/clayauld/pandoc-md2pdf-web:latest
```

### PDF Conversion Settings

The application uses sensible defaults for PDF generation. These are configured in `server/index.js`:

| Setting | Default Value | Description |
|---------|---------------|-------------|
| PDF Engine | `xelatex` | LaTeX engine (supports Unicode and modern fonts) |
| Paper Size | `letter` | US Letter (8.5" × 11"). Change to `a4` for European standard |
| Margins | `1in` | All sides have 1-inch margins |
| Main Font | `Libertinus Serif` | Professional serif font for body text |
| Mono Font | `Libertinus Mono` | Monospace font for code blocks |
| Document Class | `article` | LaTeX document class |
| Paragraph Spacing | `12pt` | Space between paragraphs |

**Advanced**: To modify these settings, edit the Pandoc arguments in `server/index.js` and rebuild the image.

### Special Features

- **Line Breaks**: The included `linebreaks.lua` filter converts HTML `<break>` tags in your Markdown to proper LaTeX line breaks
- **Watermarks**: When enabled, injects `watermark.tex` which uses the LaTeX `draftwatermark` package

---

## 🎨 Font Customization

### Using Custom Fonts

The Docker image includes the **Libertinus** font family by default. To use your own fonts:

1. **Add font files** to the `server/fonts/` directory
   - Supported formats: `.otf` (OpenType) or `.ttf` (TrueType)
   - Example structure:
     ```
     server/fonts/
       OTF/
         MyFont-Regular.otf
         MyFont-Bold.otf
         MyFont-Italic.otf
     ```

2. **Update the font configuration** in `server/index.js`:
   ```javascript
   '-V', 'mainfont=My Font Family Name',
   '-V', 'monofont=My Mono Font',
   ```

3. **Rebuild the Docker image**:
   ```bash
   docker compose up --build
   ```

The Dockerfile automatically:
- Installs `fontconfig` for font management
- Copies fonts from `server/fonts/` to `/usr/local/share/fonts/custom/`
- Refreshes the font cache with `fc-cache -fv`

### Finding Font Names

To find the exact name XeLaTeX expects, inside the container run:
```bash
docker compose exec web fc-list | grep "YourFont"
```

### Included Fonts

The Libertinus font family provides:
- **Libertinus Serif** - Body text (Regular, Bold, Italic, Bold Italic, Semibold)
- **Libertinus Sans** - Sans-serif variant
- **Libertinus Mono** - Code blocks and monospace text
- **Libertinus Math** - Mathematical typesetting

---

## 🛠️ Development Setup

### Prerequisites for Development
- Docker & Docker Compose
- A text editor (VS Code, Sublime Text, etc.)
- Basic knowledge of Node.js/Express (for backend modifications)

### Running in Development Mode

1. **Clone the repository**:
```bash
git clone https://github.com/clayauld/pandoc-md2pdf-web.git
cd pandoc-md2pdf-web
```

2. **Start with hot-reload enabled**:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

3. **The override file (`docker-compose.override.yml`) mounts**:
   - `./public/` → `/app/public/` (frontend files)
   - `./server/` → `/app/server/` (backend code)
   - Container's `node_modules` are preserved (no conflicts with your local machine)

4. **Make changes** to files in `public/` or `server/`, and they'll be reflected immediately

### Viewing Logs

**View live logs**:
```bash
docker compose logs -f web
```

**View only errors**:
```bash
docker compose logs web | grep -i error
```

### Project Structure Explained

```
pandoc-md2pdf-web/
├── public/                    # Frontend (single-page web UI)
│   ├── index.html            # Main HTML page
│   ├── style.css             # Styling
│   └── app.js                # JavaScript for file upload & interaction
│
├── server/                    # Backend (Node.js/Express)
│   ├── index.js              # Main server file, routes, Pandoc logic
│   ├── package.json          # Node.js dependencies
│   ├── fonts/                # Custom fonts (copied to container)
│   │   └── OTF/              # OpenType fonts
│   └── tmp/                  # Temporary upload directories (auto-created)
│
├── convert_to_pdf.sh         # Shell script for Pandoc conversion
├── linebreaks.lua            # Lua filter for line break handling
├── watermark.tex             # LaTeX template for watermarks
│
├── Dockerfile                # Container build instructions
├── docker-compose.yml        # Production compose config
├── docker-compose.override.yml # Development overrides (hot reload)
│
├── README.md                 # This file
└── LICENSE                   # AGPL-3.0 license
```

### Technology Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks, lightweight)
- **Backend**: Node.js 20+ with Express.js
- **Conversion**: Pandoc 3.x + XeLaTeX + TeXLive
- **Container**: Docker with Debian base image

### Making Changes

**To modify the UI**:
- Edit files in `public/` (HTML, CSS, JS)

**To change conversion logic**:
- Edit `server/index.js` (Pandoc arguments, routes)
- Edit `convert_to_pdf.sh` (shell script wrapper)
- Edit `linebreaks.lua` (Lua filter)
- Edit `watermark.tex` (LaTeX watermark template)

**To add dependencies**:
- Update `server/package.json`
- Rebuild: `docker compose up --build`

---

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 🚫 "Fonts not applied to PDF"

**Problem**: Your custom font isn't showing up in the PDF.

**Solutions**:
1. Ensure font files (`.otf` or `.ttf`) are in `server/fonts/` before building
2. Check the font family name matches XeLaTeX expectations:
   ```bash
   docker compose exec web fc-list | grep -i "your-font-name"
   ```
3. Verify font configuration in `server/index.js`:
   ```javascript
   '-V', 'mainfont=Exact Font Family Name',
   ```
4. Rebuild the image: `docker compose up --build`

#### 📦 "Missing LaTeX packages"

**Problem**: Conversion fails with errors about missing LaTeX packages.

**Solution**: Extend the `Dockerfile` to install additional packages:
```dockerfile
RUN apt-get update && apt-get install -y \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-xetex \
    texlive-lang-european \
    # Add your package here
    && rm -rf /var/lib/apt/lists/*
```

Then rebuild: `docker compose up --build`

#### ❌ "Conversion fails for my document"

**Problem**: Specific Markdown file fails to convert.

**Troubleshooting steps**:
1. **Check the logs**:
   ```bash
   docker compose logs -f web
   ```
   
2. **Test with a simple Markdown file**:
   ```markdown
   # Test
   This is a test.
   ```
   If this works, the issue is with your document content.

3. **Common causes**:
   - Unusual Unicode characters (need specific fonts)
   - Very large images (resize them)
   - Complex tables (simplify or use HTML tables)
   - Custom LaTeX commands (may need packages)

4. **File size**: Uploads are limited to 10MB. Compress images if needed.

#### 🐳 "Port 8080 already in use"

**Problem**: Another application is using port 8080.

**Solution**: Use a different port:
```bash
docker run --rm -p 9090:8080 ghcr.io/clayauld/pandoc-md2pdf-web:latest
```
Then access at: http://localhost:9090

Or modify `docker-compose.yml`:
```yaml
ports:
  - "9090:8080"
```

#### 🏗️ "Container build fails"

**Problem**: Docker build errors.

**Solutions**:
1. Ensure Docker is up to date: `docker --version`
2. Clean Docker build cache:
   ```bash
   docker system prune -a
   docker compose build --no-cache
   ```
3. Check disk space: `df -h`

#### 💻 "Architecture mismatch warnings (ARM/M1 Mac)"

**Problem**: Running on Apple Silicon (M1/M2) shows platform warnings.

**Note**: The published image targets `linux/amd64`. It will run on ARM Macs via emulation (Rosetta) but may be slower.

**Solution for better performance**: Build natively:
```bash
docker compose build --build-arg BUILDPLATFORM=linux/arm64
```

### Getting Help

If you encounter other issues:
1. Check existing [GitHub Issues](https://github.com/clayauld/pandoc-md2pdf-web/issues)
2. Review container logs: `docker compose logs web`
3. Open a new issue with:
   - Error messages
   - Steps to reproduce
   - Your Docker version
   - Sample Markdown file (if relevant)

---

## 🔒 Security Notes

This application is designed for trusted environments. Security considerations:

### Built-in Protections

✅ **File size limits**: Uploads capped at ~10MB to prevent resource exhaustion  
✅ **File type validation**: Only `.md` and `text/plain` MIME types accepted  
✅ **Filename sanitization**: Special characters and path traversal attempts blocked  
✅ **Isolated temp directories**: Each request gets a unique temporary directory  
✅ **Cleanup**: Temporary files removed after PDF generation  

### Security Recommendations

⚠️ **Not recommended for untrusted public internet use** without additional hardening:

1. **Deploy behind authentication** (e.g., OAuth2 proxy, VPN)
2. **Use a reverse proxy** (nginx, Traefik) with rate limiting
3. **Network isolation**: Run in a private network or behind a firewall
4. **Container security**: Run with read-only filesystem where possible
5. **Monitor resources**: Set memory/CPU limits in docker-compose.yml

### What This Tool Does NOT Protect Against

❌ Malicious LaTeX code injection (LaTeX can execute system commands)  
❌ Resource exhaustion from extremely complex documents  
❌ Brute force attacks (no rate limiting by default)  

**Best Practice**: Treat this as an internal tool for trusted users, or add authentication and monitoring for production deployments.

---

## 📚 Project Structure

```
pandoc-md2pdf-web/
│
├── 🌐 Frontend (public/)
│   ├── index.html          # Main web interface
│   ├── style.css           # Styling and layout
│   └── app.js              # Upload logic and API calls
│
├── ⚙️ Backend (server/)
│   ├── index.js            # Express server, routes, Pandoc integration
│   ├── package.json        # Node.js dependencies
│   ├── fonts/              # Custom fonts (bundled in image)
│   └── tmp/                # Temporary upload directories
│
├── 🔧 Conversion Scripts
│   ├── convert_to_pdf.sh   # Shell wrapper for Pandoc
│   ├── linebreaks.lua      # Lua filter for line breaks
│   └── watermark.tex       # LaTeX watermark template
│
├── 🐳 Docker Configuration
│   ├── Dockerfile          # Container build
│   ├── docker-compose.yml  # Production setup
│   └── docker-compose.override.yml  # Development overrides
│
└── 📄 Documentation
    ├── README.md           # This comprehensive guide
    └── LICENSE             # AGPL-3.0 license
```

---

## 📜 License

**AGPL-3.0-only**

This project is licensed under the GNU Affero General Public License v3.0. See the `LICENSE` file for full details.

### What This Means

- ✅ You can use this software freely
- ✅ You can modify and redistribute it
- ✅ You can use it commercially
- ⚠️ If you modify and deploy this software (even as a web service), you must:
  - Make your source code available
  - License modifications under AGPL-3.0
  - Provide a link to the source code to users

### Contributing

Contributions are welcome! By contributing, you agree to license your contributions under AGPL-3.0-only.

**To contribute**:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 🙏 Acknowledgments

This project is built on the shoulders of excellent open-source tools:

- **[Pandoc](https://pandoc.org/)** - Universal document converter
- **[XeLaTeX](https://tug.org/xetex/)** - Modern TeX engine with Unicode support
- **[Libertinus Fonts](https://github.com/alerque/libertinus)** - Beautiful open-source typeface
- **[Node.js](https://nodejs.org/)** & **[Express](https://expressjs.com/)** - Web server foundation
- **[Docker](https://www.docker.com/)** - Containerization platform

---

## 📞 Support & Links

- **GitHub Repository**: [github.com/clayauld/pandoc-md2pdf-web](https://github.com/clayauld/pandoc-md2pdf-web)
- **Docker Image**: [ghcr.io/clayauld/pandoc-md2pdf-web](https://github.com/clayauld/pandoc-md2pdf-web/pkgs/container/pandoc-md2pdf-web)
- **Issues**: [Report bugs or request features](https://github.com/clayauld/pandoc-md2pdf-web/issues)