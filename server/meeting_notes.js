const express = require('express');
const multer = require('multer');
const path = require('path');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');
const mime = require('mime-types');

const router = express.Router();
const fs = require('fs/promises');

// Configuration
const ENABLE_MEETING_NOTES = process.env.ENABLE_MEETING_NOTES === 'true';
const LLM_API_BASE = process.env.LLM_API_BASE;
const LLM_API_KEY = process.env.LLM_API_KEY;

/**
 * Determine if a given base URL points to an OpenAI-hosted endpoint.
 * This parses the URL and inspects the hostname rather than doing a
 * substring check on the full URL string.
 */
function isOpenAIBaseUrl(baseUrl) {
  if (!baseUrl) return false;
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    // Treat api.openai.com and any subdomains of openai.com as OpenAI.
    return host === 'api.openai.com' || host.endsWith('.openai.com');
  } catch (e) {
    // If the URL is invalid, do not treat it as an OpenAI host.
    return false;
  }
}
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo'; // Default model if not specified
const LIBRARY_DIR = path.join(__dirname, 'data', 'library');

// Ensure library directory exists
fs.mkdir(LIBRARY_DIR, { recursive: true }).catch(err => console.error('Failed to create library dir:', err));

// Rate limiter for meeting notes generation
const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: 'Too many generation requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for library endpoints: 20 requests per minute per IP
const libraryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many library requests from this IP, please try again later.',
});

// Multer setup for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/octet-stream' // Sometimes markdown files are detected as octet-stream
    ];
    // Check extension as fallback
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.txt', '.md', '.pdf'];

    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .txt, .md, and .pdf are allowed.'));
    }
  }
});

// Helper function to extract text from buffer
async function extractText(buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error(`Failed to parse PDF file: ${originalname}`);
    }
  } else {
    // Assume text/markdown
    return buffer.toString('utf8');
  }
}

// Initialize OpenAI client globally to reuse connection and config
// If LLM_API_KEY is missing but LLM_API_BASE is set (e.g. LiteLLM), use a dummy key
const openai = new OpenAI({
  apiKey: LLM_API_KEY || 'dummy-key',
  baseURL: LLM_API_BASE,
});

// --- Library Endpoints ---

// List files in the library
router.get('/library', libraryLimiter, async (req, res) => {
    try {
        const files = await fs.readdir(LIBRARY_DIR);
        res.json(files);
    } catch (err) {
        console.error('Error reading library:', err);
        res.status(500).json({ error: 'Failed to list library files' });
    }
});

// Upload a file to the library
router.post('/library/upload', libraryLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const safeName = path.basename(req.file.originalname);
        await fs.writeFile(path.join(LIBRARY_DIR, safeName), req.file.buffer);
        res.json({ success: true, filename: safeName });
    } catch (err) {
        console.error('Error saving library file:', err);
        res.status(500).json({ error: 'Failed to save file to library' });
    }
});

// Delete a file from the library
router.delete('/library/:filename', libraryLimiter, async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);
        await fs.unlink(path.join(LIBRARY_DIR, filename));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting library file:', err);
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
        }
        res.status(500).json({ error: 'Failed to delete file' });
    }
});


// Helper to read library file
async function readLibraryFile(filename) {
    if (!filename) return '';
    try {
        const filePath = path.join(LIBRARY_DIR, path.basename(filename));
        const buffer = await fs.readFile(filePath);
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        return await extractText(buffer, mimeType, filename);
    } catch (err) {
        console.warn('Failed to read library file %s:', filename, err.message);
        return '';
    }
}

// POST /api/generate-minutes
router.post('/generate-minutes', generateLimiter, upload.fields([
  { name: 'transcript', maxCount: 1 },
  { name: 'agenda', maxCount: 1 },
  { name: 'context', maxCount: 1 },
  { name: 'template', maxCount: 1 }
]), async (req, res) => {
  if (!ENABLE_MEETING_NOTES) {
    return res.status(403).json({ error: 'Meeting notes generation is disabled.' });
  }

  // Ensure at least one config is present if we are going to try to call the API
  if (!process.env.LLM_API_BASE || (!process.env.LLM_API_KEY && isOpenAIBaseUrl(process.env.LLM_API_BASE))) {
     return res.status(500).json({ error: 'LLM configuration missing (API Key or Base URL).' });
  }

  try {
    const files = req.files || {};
    const body = req.body || {};

    // 1. Validate inputs
    if ((!files.transcript || !files.transcript[0]) && !body.transcriptText) {
      // Transcript is strictly required as a file upload for now, or text if we wanted to support pasted text
      return res.status(400).json({ error: 'Transcript file is required.' });
    }

    // 2. Extract text from files or library references
    const transcriptText = await extractText(
      files.transcript[0].buffer,
      files.transcript[0].mimetype,
      files.transcript[0].originalname
    );

    let agendaText = '';
    if (files.agenda && files.agenda[0]) {
      agendaText = await extractText(
        files.agenda[0].buffer,
        files.agenda[0].mimetype,
        files.agenda[0].originalname
      );
    } else if (body.agendaText) {
      agendaText = body.agendaText;
    }

    let attendanceText = body.attendanceText || '';

    let contextText = '';
    if (files.context && files.context[0]) {
      contextText = await extractText(
        files.context[0].buffer,
        files.context[0].mimetype,
        files.context[0].originalname
      );
    } else if (body.contextFile) {
        contextText = await readLibraryFile(body.contextFile);
    }

    let templateText = '';
    if (files.template && files.template[0]) {
      templateText = await extractText(
        files.template[0].buffer,
        files.template[0].mimetype,
        files.template[0].originalname
      );
    } else if (body.templateFile) {
        templateText = await readLibraryFile(body.templateFile);
    }

    // 3. Construct the prompt
    let systemPrompt = "You are a helpful assistant that generates professional meeting minutes.";
    let userPrompt = `Please generate meeting minutes based on the following information:\n\n`;

    if (agendaText) {
      userPrompt += `### Agenda:\n${agendaText}\n\n`;
    }

    if (attendanceText) {
      userPrompt += `### Attendance:\n${attendanceText}\n\n`;
    }

    userPrompt += `### Transcript (Source File: \`${files.transcript[0].originalname}\`):\n`;
    userPrompt += `*Note: Use the timestamp from the filename (e.g., GMT/UTC time) to determine the correct local date of the meeting if not explicitly stated in the text.*\n\n`;
    userPrompt += `${transcriptText}\n\n`;

    if (contextText) {
      userPrompt += `### Past Minutes (Context):\n${contextText}\n\n`;
    }

    if (templateText) {
      userPrompt += `### Formatting Template:\n${templateText}\n\n`;
      userPrompt += `Please follow the style and structure of the provided template strictly.\n`;
    }

    userPrompt += `
Instructions:
1. Create meeting minutes based on the agenda items and transcript.
2. Add a timestamp to call to order and motion to adjourn. Determine the time of adjournment based on start time and length of the meeting (if available in transcript).
3. Output ONLY the meeting minutes in valid Markdown format. Do not include any conversational text, confirmation checks, or code block wrappers (like \`\`\`markdown).
`;

    // 4. Call LLM
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: LLM_MODEL,
    });

    let generatedText = completion.choices[0].message.content || '';

    generatedText = generatedText.replace(/^```(?:�markdown�)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    // 5. Return result
    res.json({ markdown: generatedText });

  } catch (error) {
    console.error('Error generating meeting minutes:', error);
    res.status(500).json({ error: 'Failed to generate meeting minutes.', details: error.message });
  }
});

module.exports = router;
