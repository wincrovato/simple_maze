require('dotenv').config();

['ANTHROPIC_API_KEY', 'TAVILY_API_KEY'].forEach(key => {
  if (!process.env[key]) {
    console.error(`FATAL: Missing environment variable ${key}. Copy .env.example to .env and fill in your keys.`);
    process.exit(1);
  }
});

const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const client = new Anthropic();

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are accepted.'));
    }
  },
});

async function parseResume(file) {
  if (file.mimetype === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  } else {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
}

const tavilyTool = {
  name: 'search_jobs',
  description:
    'Search the web for current, real job listings. Use this tool multiple times with ' +
    'different targeted queries to find the best matching open positions for the candidate. ' +
    'Each search should target a specific role, skill combination, or seniority level.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The job search query. Be specific — include job title, key skills, and optionally ' +
          'location or remote. Example: "senior React developer remote 2024"',
      },
      max_results: {
        type: 'integer',
        description: 'Number of results to retrieve. Default 5, max 10.',
        default: 5,
      },
    },
    required: ['query'],
  },
};

async function executeTavilySearch(query, maxResults = 5) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      include_answer: false,
      max_results: Math.min(maxResults, 10),
      include_domains: [
        'linkedin.com',
        'indeed.com',
        'glassdoor.com',
        'lever.co',
        'greenhouse.io',
        'workday.com',
        'jobs.apple.com',
        'careers.google.com',
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Tavily error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    content: r.content ? r.content.slice(0, 500) : '',
  }));
}

const SYSTEM_PROMPT = `You are an expert career advisor and job matching specialist. Your task is to analyze a candidate's resume and find real, current job listings that are an excellent match.

Follow this exact process:

## Step 1: Extract the Candidate Profile
Read the resume and identify:
- Primary job title / role
- Years of experience
- Top 5–8 technical skills or domain expertise
- Industry background
- Location (if mentioned) or assume remote is acceptable
- Seniority level (junior / mid / senior / lead / manager)

## Step 2: Search for Matching Jobs
Use the search_jobs tool to find real job listings. Run 3–5 targeted searches:
- Primary role + top skills
- Role + seniority level
- Alternative job titles for the same role
- Remote opportunities if location is flexible

## Step 3: Select the Best Matches
From all search results, select the 5–8 BEST matches where:
- Job title aligns with the candidate's experience
- Required skills overlap significantly
- Seniority level is appropriate
- matchScore is 60 or higher (do not include weaker matches)

matchScore guide:
- 90–100: Nearly perfect match
- 75–89: Strong match
- 60–74: Good match with minor gaps
- Below 60: Do not include

## Step 4: Return Structured JSON
After all searches are complete, return ONLY a valid JSON object — no markdown, no explanation, no code fences. The JSON must follow this exact schema:

{
  "candidateProfile": {
    "primaryRole": "string",
    "seniorityLevel": "string",
    "topSkills": ["skill1", "skill2"],
    "yearsExperience": "string"
  },
  "jobs": [
    {
      "title": "exact job title from the listing",
      "company": "company name",
      "location": "city/state or Remote or Hybrid",
      "matchScore": integer 0-100,
      "matchReason": "2-3 sentences explaining the match, referencing specific skills from the resume",
      "applyUrl": "direct URL to the job listing"
    }
  ]
}

IMPORTANT: Only include jobs with real URLs found via search. Do not fabricate listings.`;

function extractJSON(text) {
  // Strip code fences
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // If it starts with { we're done
  if (s.startsWith('{')) return s;
  // Otherwise find the first { ... } block in the text
  const match = s.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return s;
}

async function runClaudeJobSearch(resumeText) {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Here is the candidate\'s resume. Please analyze it and find matching job listings.\n\n<resume>\n',
        },
        {
          type: 'text',
          text: resumeText,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: '\n</resume>\n\nNow extract the candidate profile, search for matching jobs, and return the structured JSON.',
        },
      ],
    },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [tavilyTool],
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock) throw new Error('Claude returned no text in final response.');
      const raw = textBlock.text.trim();
      console.log('Claude raw response (first 500 chars):', raw.slice(0, 500));
      const jsonText = extractJSON(raw);
      return JSON.parse(jsonText);
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use' || block.name !== 'search_jobs') continue;

        let resultContent;
        try {
          const results = await executeTavilySearch(
            block.input.query,
            block.input.max_results || 5
          );
          resultContent = JSON.stringify(results);
        } catch (err) {
          resultContent = JSON.stringify({ error: err.message });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent,
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error('Job search exceeded maximum iterations. Please try again.');
}

app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const resumeText = await parseResume(req.file);
    if (resumeText.trim().length < 50) {
      return res.status(422).json({
        error: 'Could not extract meaningful text from the file. Is it a scanned image PDF?',
      });
    }

    const result = await runClaudeJobSearch(resumeText);

    if (!result.jobs || !Array.isArray(result.jobs)) {
      return res.status(500).json({ error: 'Invalid response structure from AI.' });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Maximum size is 10 MB.' });
    }
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'AI returned malformed JSON. Please try again.' });
    }
    res.status(500).json({ error: err.message || 'An unexpected error occurred.' });
  }
});

// Handle multer errors from fileFilter
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dreamy Garden Job Finder running at http://localhost:${PORT}`);
});
