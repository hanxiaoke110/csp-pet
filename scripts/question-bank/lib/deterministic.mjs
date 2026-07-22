import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROHIBITED = /\b(?:cin|scanf|fgets|gets|argv|argc|fstream|ifstream|ofstream|freopen|system|popen|socket|thread|chrono|time|rand|random_device)\b/;

function normalizeOutput(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^['"`]|['"`]$/g, '');
}

function optionPayload(option) {
  return normalizeOutput(String(option || '').replace(/^[A-DＡ-Ｄ][.、．:\s)]*/i, ''));
}

export function detectDeterministicCandidate(question) {
  if (question.type !== 'choice') return { supported: false, reason: 'unsupported_question_type' };
  if (!question.code || !/\b(?:int|signed)\s+main\s*\([^)]*\)\s*\{/.test(question.code)) {
    return { supported: false, reason: 'incomplete_program' };
  }
  if (PROHIBITED.test(question.code) || /#include\s*[<"](?:fstream|thread|chrono|random)/.test(question.code)) {
    return { supported: false, reason: 'input_or_unsafe_api' };
  }
  if (/_{3,}|横线处|填入代码|在此处填/.test(question.code)) {
    return { supported: false, reason: 'program_has_blank' };
  }
  return { supported: true, reason: 'complete_no_input_program' };
}

function findCompiler() {
  for (const compiler of ['clang++', 'g++']) {
    const result = spawnSync('command', ['-v', compiler], { shell: true, encoding: 'utf8' });
    if (result.status === 0) return compiler;
  }
  return null;
}

export function matchUniqueOption(stdout, options) {
  const output = normalizeOutput(stdout);
  const matches = options
    .map((option, index) => ({ index, value: optionPayload(option) }))
    .filter(item => item.value === output);
  return matches.length === 1 ? matches[0].index : null;
}

export async function solveDeterministically(question) {
  const candidate = detectDeterministicCandidate(question);
  if (!candidate.supported) return { answerIndex: null, ...candidate };
  const compiler = findCompiler();
  if (!compiler) return { answerIndex: null, supported: false, reason: 'compiler_unavailable' };

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-question-'));
  const sourcePath = path.join(directory, 'question.cpp');
  const binaryPath = path.join(directory, 'question');
  try {
    fs.writeFileSync(sourcePath, question.code);
    const compiled = spawnSync(compiler, ['-std=c++17', '-O0', sourcePath, '-o', binaryPath], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    if (compiled.error?.code === 'ETIMEDOUT') return { answerIndex: null, supported: true, reason: 'compile_timeout' };
    if (compiled.status !== 0) return { answerIndex: null, supported: true, reason: 'compile_failed' };

    const executed = spawnSync(binaryPath, [], {
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    if (executed.error?.code === 'ETIMEDOUT') return { answerIndex: null, supported: true, reason: 'run_timeout' };
    if (executed.status !== 0) return { answerIndex: null, supported: true, reason: 'run_failed' };
    const answerIndex = matchUniqueOption(executed.stdout, question.options);
    return {
      answerIndex,
      supported: true,
      reason: answerIndex === null ? 'output_did_not_match_one_option' : 'matched_output',
      stdoutHash: createHash('sha256').update(executed.stdout).digest('hex'),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
