import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'reports/csp-sources');
const indexPath = path.join(sourceRoot, 'index.json');
const outputPath = path.join(sourceRoot, 'structured-choice-sources.json');
const python = '/Users/hanliuliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const pythonPath = '/Users/hanliuliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python';
const helper = path.join(root, 'scripts/question-bank/extract-pdf-text.py');
const docxHelper = path.join(root, 'scripts/question-bank/extract-docx-text.py');
const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const localTrainingRoot = '/Users/hanliuliu/Desktop/csp专项练习';
const SOURCE_OVERRIDES = {
  '2024-J': {
    type: 'text',
    path: path.join(localTrainingRoot, 'csp-j1-training/scripts/output/cnblogs_2024_answers.md'),
  },
  '2024-S': {
    type: 'docx',
    path: path.join(localTrainingRoot, 'CSP- S J 2019-2025初赛复赛真题及答案/2024csp-j&s初赛复赛答案/csp-s/2024csp-s初赛真题和解析.docx'),
  },
};

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function stripJsonFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function validTextLayer(text) {
  const compact = String(text || '').replace(/\s/g, '');
  if (compact.length < 80) return false;
  const nulls = (text.match(/\0/g) || []).length;
  return nulls / compact.length < 0.01;
}

function questionSection(pages) {
  const result = [];
  for (const page of pages) {
    const marker = page.text.search(/(?:^|\n)\s*(?:二[.、．]|二、)?\s*(?:阅读程序|问题求解)/m);
    result.push({ ...page, text: marker >= 0 ? page.text.slice(0, marker) : page.text });
    if (marker >= 0) break;
  }
  return result;
}

function loadPaperPages(entry) {
  const override = SOURCE_OVERRIDES[entry.key];
  if (override && fs.existsSync(override.path)) {
    if (override.type === 'text') {
      return [{ page: 1, method: 'local_reference_text', text: fs.readFileSync(override.path, 'utf8') }];
    }
    const overrideTextPath = path.join(sourceRoot, 'overrides', `${entry.key}.txt`);
    fs.mkdirSync(path.dirname(overrideTextPath), { recursive: true });
    execFileSync(python, [docxHelper, override.path, overrideTextPath], {
      env: { ...process.env, PYTHONPATH: pythonPath },
    });
    return [{ page: 1, method: 'local_reference_docx', text: fs.readFileSync(overrideTextPath, 'utf8') }];
  }
  const textLayerPath = path.join(sourceRoot, 'pdf-text', `${entry.key}.json`);
  fs.mkdirSync(path.dirname(textLayerPath), { recursive: true });
  if (!fs.existsSync(textLayerPath)) {
    execFileSync(python, [helper, path.join(root, entry.pdfPath), textLayerPath], {
      env: { ...process.env, PYTHONPATH: pythonPath },
    });
  }
  const textPages = JSON.parse(fs.readFileSync(textLayerPath, 'utf8')).pages;
  const pages = entry.pages.map((page, index) => {
    const textLayer = textPages[index]?.text || '';
    const ocrText = fs.readFileSync(path.join(root, page.textPath), 'utf8');
    return {
      page: page.page,
      method: validTextLayer(textLayer) ? 'pdf_text' : 'paddle_ocr',
      text: validTextLayer(textLayer) ? textLayer : ocrText,
    };
  });
  return questionSection(pages);
}

async function fetchWithRetry(init, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(apiUrl, { ...init, signal: AbortSignal.timeout(240_000) });
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = new Error(`DeepSeek HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(10_000, 1_000 * (2 ** attempt))));
  }
  throw lastError;
}

function validateQuestions(value, key) {
  const questions = value?.questions;
  if (!Array.isArray(questions) || questions.length !== 15) {
    throw new Error(`${key}: expected 15 choice questions, received ${questions?.length ?? 'invalid'}`);
  }
  const numbers = questions.map(question => question.number);
  if (numbers.some((number, index) => number !== index + 1)) throw new Error(`${key}: invalid question numbering`);
  for (const question of questions) {
    if (!String(question.question || '').trim()) throw new Error(`${key} Q${question.number}: empty stem`);
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`${key} Q${question.number}: invalid options`);
    }
    question.options = question.options.map((option, index) => {
      if (String(option || '').trim()) return String(option).trim();
      question.uncertainFields = [...new Set([...(question.uncertainFields || []), `option${'ABCD'[index]}_visual`])];
      return `[原卷图示选项 ${'ABCD'[index]}]`;
    });
    question.requiresVisual = question.uncertainFields.some(field => /visual|图/.test(String(field)));
    if (!Array.isArray(question.sourcePages) || question.sourcePages.length === 0) {
      throw new Error(`${key} Q${question.number}: missing source pages`);
    }
  }
  return questions;
}

async function extractPaper(entry, apiKey) {
  const pages = loadPaperPages(entry);
  let validationFeedback = '';
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchWithRetry({
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 24000,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '你是 CSP-J/S 官方试卷结构化录入员，输入是按页标记的 PDF 文本或 PaddleOCR 文本。',
              '只提取试卷第一部分第1至15道单项选择题，不提取阅读程序、完善程序、答案或解析。',
              '必须保持原题意义、代码和 A/B/C/D 原始顺序；可修正显然 OCR 字符误识，不得改写题目或自行创作代码。',
              '图形、表格或上下文无法从文本完整恢复时，保留可见文本并在 uncertainFields 中标明，禁止猜测。',
              '如果某个选项完全是图形，将该选项输出为空字符串，并在 uncertainFields 写 optionA_visual 等标记；后续程序会绑定原页图。',
              '返回 JSON：{"questions":[{"number":1,"question":"","code":null,"options":["","","",""],"sourcePages":[1],"uncertainFields":[]}]}',
              'number 必须从1到15且不得缺失。code 只放题面真实存在的代码。选项不要包含 A./B./C./D. 前缀。',
              validationFeedback,
            ].filter(Boolean).join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({ paper: entry.key, pages }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`${entry.key}: DeepSeek HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const data = await response.json();
    try {
      const parsed = JSON.parse(stripJsonFence(data.choices?.[0]?.message?.content));
      return {
        key: entry.key,
        model: data.model || model,
        usage: data.usage || null,
        pageMethods: Object.fromEntries(pages.map(page => [page.page, page.method])),
        questions: validateQuestions(parsed, entry.key),
      };
    } catch (error) {
      lastError = error;
      validationFeedback = `上一次输出未通过硬校验：${error.message}。请重新检查原文并输出完整结果。`;
      console.warn(`${entry.key}: retry ${attempt}/3 after ${error.message}`);
    }
  }
  throw lastError;
}

export async function extractCspChoiceSources({ apiKey = process.env.DEEPSEEK_API_KEY } = {}) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  const sourceIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const cached = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
    : { schemaVersion: 1, papers: [] };
  const byKey = new Map(cached.papers.map(paper => [paper.key, paper]));
  for (const entry of sourceIndex.entries) {
    if (byKey.has(entry.key)) continue;
    console.log(`Extracting ${entry.key} choice questions...`);
    const paper = await extractPaper(entry, apiKey);
    byKey.set(entry.key, paper);
    writeJsonAtomic(outputPath, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      papers: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    });
  }
  return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  extractCspChoiceSources()
    .then(result => console.log(`Extracted ${result.papers.length} CSP choice papers.`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
