const express = require('express');
const multer = require('multer');
const path = require('path');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Configuration
const ENABLE_MEETING_NOTES = process.env.ENABLE_MEETING_NOTES === 'true';
const LLM_API_BASE = process.env.LLM_API_BASE;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo'; // Default model if not specified

// Rate limiter for meeting notes generation
const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: 'Too many generation requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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

  if (!process.env.LLM_API_KEY && !process.env.LLM_API_BASE) {
     return res.status(500).json({ error: 'LLM configuration missing (API Key or Base URL).' });
  }

  try {
    const files = req.files;

    // 1. Validate inputs
    if (!files || !files.transcript) {
      return res.status(400).json({ error: 'Transcript file is required.' });
    }

    // 2. Extract text from files
    const transcriptText = await extractText(
      files.transcript[0].buffer,
      files.transcript[0].mimetype,
      files.transcript[0].originalname
    );

    let agendaText = '';
    if (files.agenda) {
      agendaText = await extractText(
        files.agenda[0].buffer,
        files.agenda[0].mimetype,
        files.agenda[0].originalname
      );
    }

    let contextText = '';
    if (files.context) {
      contextText = await extractText(
        files.context[0].buffer,
        files.context[0].mimetype,
        files.context[0].originalname
      );
    }

    let templateText = '';
    if (files.template) {
      templateText = await extractText(
        files.template[0].buffer,
        files.template[0].mimetype,
        files.template[0].originalname
      );
    }

    // 3. Construct the prompt
    let systemPrompt = "You are a helpful assistant that generates professional meeting minutes.";
    let userPrompt = `Please generate meeting minutes based on the following information:\n\n`;

    if (agendaText) {
      userPrompt += `### Agenda:\n${agendaText}\n\n`;
    }

    userPrompt += `### Transcript:\n${transcriptText}\n\n`;

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
    const openai = new OpenAI({
      apiKey: LLM_API_KEY || 'dummy-key', // LiteLLM might not need a real key if running locally, but SDK requires one
      baseURL: LLM_API_BASE,
    });

    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: LLM_MODEL,
    });

    let generatedText = completion.choices[0].message.content;

    // Clean up potential markdown code blocks if the LLM adds them despite instructions
    // Remove ```markdown ... ``` or ``` ... ```
    generatedText = generatedText.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

    // 5. Return result
    res.json({ markdown: generatedText });

  } catch (error) {
    console.error('Error generating meeting minutes:', error);
    res.status(500).json({ error: 'Failed to generate meeting minutes.', details: error.message });
  }
});

module.exports = router;
