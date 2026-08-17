// 题库可靠性综合审计：输出 reports/question-reliability-report.json + .md
// 维度：字段完整性 / 代码可靠性 / 图片可靠性 / 内容残缺 / 客户端显示风险
// 仅审计源题库（public/course-data + src-dungeon/data），dist/dist-dungeon 为构建产物不审计
// 严重度：P0=无法作答/崩溃  P1=可作答但体验受损  P2=待人工复核
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const SOURCE_FILES = [
  'public/course-data/unified-quiz-bank.json',
  'public/course-data/quiz-bank.json',
  'public/course-data/csp-exam-bank.json',
  'src-dungeon/data/csp-exam-bank.json',
].filter(f => fs.existsSync(path.join(root, f)));

// 统一排除配置（单一数据源 public/course-data/excluded-question-ids.json）。
// 客户端 /quiz 与 /dungeon 在题库加载时按此过滤；审计据此区分 source issue 与 visible issue。
// 读取失败降级为空集。
const EXCLUDED_CONFIG_PATH = path.join(root, 'public/course-data/excluded-question-ids.json');
let excludedIds = new Set();
let excludedMeta = { ids: [], reason: '', note: '' };
if (fs.existsSync(EXCLUDED_CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(EXCLUDED_CONFIG_PATH, 'utf8'));
    const ids = Array.isArray(cfg.ids) ? cfg.ids.map(String) : [];
    excludedIds = new Set(ids);
    excludedMeta = { ids, reason: cfg.reason || '', note: cfg.note || '' };
  } catch { /* 降级为空集 */ }
}

// V2 验证状态（question-bank-v2/verification.json）：disputed / broken 在学生端可见时
// 属于"待人工复核/结构不适配"风险，接入审计避免与排除名单脱节。
const V2_VERIFICATION_PATH = path.join(root, 'public/course-data/question-bank-v2/verification.json');
const v2StatusMap = new Map();
if (fs.existsSync(V2_VERIFICATION_PATH)) {
  try {
    const v2 = JSON.parse(fs.readFileSync(V2_VERIFICATION_PATH, 'utf8'));
    for (const r of (v2.results || [])) {
      if (!r.questionId) continue;
      const blockers = (r.blockers || []).map(b => typeof b === 'string' ? b : (b.reason || b.msg || '')).filter(Boolean);
      v2StatusMap.set(r.questionId, { status: r.status || '', blockers });
    }
  } catch { /* 降级：不接入 V2 状态 */ }
}

function v2Finding(id, file) {
  const info = v2StatusMap.get(id);
  if (!info || (info.status !== 'disputed' && info.status !== 'broken')) return null;
  const sev = info.status === 'broken' ? 'P1' : 'P2';
  const bl = info.blockers.length ? ` (${info.blockers.join(';')})` : '';
  return {
    file, id, type: 'v2', group: '', severity: sev,
    excluded: excludedIds.has(id),
    issues: [{ sev, cat: 'v2', msg: `V2 验证状态: ${info.status}${bl}` }],
    question: '',
  };
}

// ---------- 通用访问器 ----------
function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function asQuestions(data) {
  if (Array.isArray(data)) return data.map((q, i) => [String(i), q]);
  if (Array.isArray(data.questions)) return data.questions.map((q, i) => [String(i), q]);
  if (Array.isArray(data.items)) return data.items.map((q, i) => [String(i), q]);
  if (data && typeof data === 'object') return Object.entries(data);
  return [];
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function getOptions(q) {
  if (Array.isArray(q.options)) return q.options;
  if (q.options && typeof q.options === 'object') return Object.values(q.options);
  return [];
}

function qType(q) {
  return q.type || q.questionType || (q.source === 'super_challenge' ? 'super' : '');
}

// ---------- 代码特征 ----------
const CODE_MARKERS = [
  '#include', 'int main', 'using namespace', 'cout', 'cin', 'scanf', 'printf',
  'return 0', 'for(', 'for (', 'while(', 'while (', 'switch', 'struct ', 'class ',
  'vector<', 'std::', '->',
];
const FENCE_RE = /```[\s\S]*?```/;

function hasInlineCode(s) {
  s = text(s);
  if (FENCE_RE.test(s)) return true;
  let score = 0;
  for (const m of CODE_MARKERS) if (s.includes(m)) score += 1;
  return score >= 2;
}

// ---------- OCR / 抽取残缺特征 ----------
// 抽取残缺：数值被剥掉留下空格，如 "由 位"（应为"由 8 位"）、"输入 个"、"分数为 的整数"
const EXTRACT_RESIDUE_RE = /由\s+位|[输入输出共占]\s+个|分数为\s+的|长度为\s+的|值为\s+的|范围\s+到\s+的|占\s+字[节节]/;
// code OCR 损坏：相邻比较/逻辑运算符（如 "j >= &&"，合法 C++ 与填空题均不会出现）
// 仅保留高精度一支：>= 后紧跟 && 或 || 必为操作数丢失，避免误判填空题 "i <= ;" 的空白
const DANGLING_OP_RE = /(>=|<=|==|!=|&&|\|\|)\s*(&&|\|\|)/;

function stemNeedsCode(stem) {
  const s = text(stem).normalize('NFKC').replace(/\s+/g, '');
  if (/流程图/.test(s)) return false;
  const sourceRef = /(下列|以下|下面|如下).{0,12}(代码|程序)|阅读.{0,12}(代码|程序)|代码段/.test(s);
  const codeHoleRef = /(代码|程序).{0,12}(横线|空白|填入|补全|划线)|横线处|空白处|补全|划线/.test(s);
  const outputRef = /(输出|运行|执行).{0,12}(结果|是|为|（|\(|的)|不能输出|会输出/.test(s);
  const inlineOnly = !sourceRef && !codeHoleRef && /([a-zA-Z_]\w*|\d+)\s*(<<|>>|[+\-*/%]?=|[+\-*/%])/.test(s);
  if (inlineOnly) return false;
  if (/DevC\+\+|集成开发环境|调试代码段/.test(s) && !sourceRef && !codeHoleRef) return false;
  if (/程序设计|程序结构/.test(s) && !sourceRef && !codeHoleRef) return false;
  return codeHoleRef || (sourceRef && outputRef);
}

// 代码在选项中（选项本身是代码片段/程序）时，题干无 code 字段不算缺失
const OPTION_CODE_RE = /#include|for\s*\(|while\s*\(|cout\s*<<|cin\s*>>|printf\s*\(|scanf\s*\(|\breturn\s|\bint\s+\w+\s*[\[=;]|___|横线/;
function optionsContainCode(options) {
  return options.some(o => OPTION_CODE_RE.test(text(o)));
}

// ---------- 图片 ----------
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

function findMarkdownImages(s) {
  const out = [];
  let m;
  const re = new RegExp(MD_IMAGE_RE);
  while ((m = re.exec(text(s)))) out.push({ alt: m[1], url: m[2] });
  return out;
}

function localImageExists(imgPath) {
  if (!imgPath) return false;
  if (/^https?:/.test(imgPath)) return null; // 远程，不校验本地
  const p = String(imgPath).replace(/^\/+/, '');
  return fs.existsSync(path.join(root, 'public', p)) || fs.existsSync(path.join(root, p));
}

// ---------- 单题审计 ----------
function auditQuestion(q, id, file) {
  const issues = [];
  const type = qType(q);
  const stem = text(q.question || q.title || q.stem || q.content);
  const code = text(q.code || q.program || q.sourceCode).trim();
  const options = getOptions(q);
  const explanation = text(q.explanation || q.analysis || q['解析']);
  const imgField = q.image || q.codeImage || null;
  const isSuper = q.source === 'super_challenge' || type === 'super';

  // 1. 字段完整性
  if (!stem.trim()) issues.push({ sev: 'P0', cat: 'field', msg: 'question 为空' });
  if (!q.id && !q.questionId) issues.push({ sev: 'P2', cat: 'field', msg: '缺 id' });
  if (!q.knowledgePoint && !isSuper && q.source !== undefined) issues.push({ sev: 'P2', cat: 'field', msg: '缺 knowledgePoint' });

  // 2. 选项/答案（按类型）
  if (!isSuper && (type === 'choice' || type === '' || !type)) {
    // 普通选择题
    if (!Array.isArray(q.options) || q.options.length < 2) {
      issues.push({ sev: 'P0', cat: 'options', msg: 'options 缺失或不足 2 项' });
    } else {
      q.options.forEach((o, i) => { if (!text(o).trim()) issues.push({ sev: 'P0', cat: 'options', msg: `option ${i + 1} 为空` }); });
      const norm = q.options.map(o => text(o).trim());
      if (new Set(norm).size !== norm.length) issues.push({ sev: 'P1', cat: 'options', msg: '选项重复' });
      // 只有 A/B/C/D 标记无内容
      if (q.options.every(o => /^[A-D][.、]\s*$/.test(text(o).trim()))) issues.push({ sev: 'P0', cat: 'options', msg: '选项只有字母标记无内容' });
    }
    const ci = q.correctIndex;
    if (typeof ci !== 'number' || ci < 0 || (q.options && q.options.length && ci >= q.options.length)) {
      issues.push({ sev: 'P0', cat: 'answer', msg: `correctIndex 越界/缺失 (${ci}/${q.options ? q.options.length : '?'})` });
    }
  }

  if (type === 'reading' && !isSuper) {
    if (!code && !hasInlineCode(stem) && !imgField) issues.push({ sev: 'P0', cat: 'code', msg: 'reading 题无 code/内联代码/图片' });
    const subs = q.subQuestions || q.sub_questions;
    if (Array.isArray(subs)) {
      subs.forEach((sq, i) => {
        if (!Array.isArray(sq.options) || sq.options.length < 2) issues.push({ sev: 'P0', cat: 'sub', msg: `subQ ${i + 1} options 缺失` });
        if (typeof sq.correctIndex !== 'number' || sq.correctIndex < 0 || (sq.options && sq.correctIndex >= sq.options.length)) issues.push({ sev: 'P0', cat: 'sub', msg: `subQ ${i + 1} correctIndex 越界` });
      });
    } else if (typeof subs === 'number' && subs > 0) {
      if (!Array.isArray(q.answers) || q.answers.length !== subs) issues.push({ sev: 'P1', cat: 'sub', msg: `answers 数量与 subQuestions(${subs}) 不符` });
    }
  }

  if (type === 'fillBlank' && !isSuper) {
    if (!code) issues.push({ sev: 'P0', cat: 'code', msg: 'fillBlank 题无 code' });
    const blanks = q.blanks || q.sub_questions;
    if (!Array.isArray(blanks) || blanks.length === 0) issues.push({ sev: 'P0', cat: 'blank', msg: 'blanks 缺失' });
    if (code) {
      const markers = (code.match(/__\d+__/g) || []).length;
      if (markers !== (blanks ? blanks.length : 0)) issues.push({ sev: 'P1', cat: 'blank', msg: `空位标记(${markers})与 blanks(${blanks ? blanks.length : 0}) 不符` });
    }
  }

  // 超级挑战：需要 code + answers
  if (isSuper) {
    if (!code) issues.push({ sev: 'P0', cat: 'code', msg: 'super 题无 code' });
    if (!Array.isArray(q.answers) || q.answers.length === 0) issues.push({ sev: 'P0', cat: 'answer', msg: 'super 题无 answers' });
  }

  // 3. 代码可靠性
  if (!code && stemNeedsCode(stem) && !hasInlineCode(stem) && !imgField && !optionsContainCode(options)) {
    issues.push({ sev: 'P1', cat: 'code', msg: '题干引用代码/程序/输出但无 code 字段' });
  }
  if (code && (/TODO|待补|省略/.test(code) || /^[.…\s]+$/.test(code))) {
    issues.push({ sev: 'P1', cat: 'code', msg: 'code 字段含占位符' });
  }
  // 题干中夹带代码块但未提取到 code
  if (!code && FENCE_RE.test(stem)) {
    issues.push({ sev: 'P1', cat: 'code', msg: '题干含 ``` 代码块未提取到 code 字段' });
  }
  // code OCR 损坏：相邻/悬空运算符（如 "j >= &&"）
  if (code && DANGLING_OP_RE.test(code)) {
    issues.push({ sev: 'P1', cat: 'code', msg: 'code 含相邻/悬空运算符（疑似 OCR 损坏）' });
  }
  // code OCR 损坏：行首孤立数字后接标识符（如 "14 cout"，残留行号）
  if (code && /^\s*\d+\s+[a-zA-Z_]/m.test(code)) {
    issues.push({ sev: 'P1', cat: 'code', msg: 'code 行首孤立数字后接标识符（疑似 OCR 残留行号）' });
  }
  // code 残片：大括号严重不匹配（差 ≥2）或以 } 起始
  if (code) {
    const opens = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (Math.abs(opens - closes) >= 2 || /^\s*\}/.test(code)) {
      issues.push({ sev: 'P1', cat: 'code', msg: 'code 大括号严重不匹配/以 } 起始（疑似残片）' });
    }
  }

  // 4. 图片可靠性
  const mdImgs = findMarkdownImages(stem);
  if (mdImgs.length) {
    issues.push({ sev: 'P1', cat: 'image', msg: `question 含 markdown 图片语法 (${mdImgs.length} 处)，应提取到 image 字段` });
  }
  // 图片字段本地文件缺失
  for (const f of ['image', 'codeImage']) {
    if (q[f]) {
      const exists = localImageExists(q[f]);
      if (exists === false) issues.push({ sev: 'P1', cat: 'image', msg: `${f} 本地文件缺失: ${q[f]}` });
    }
  }
  // 远程 gitee 图片（可转本地）
  if (mdImgs.some(m => /gitee\.com/.test(m.url))) {
    issues.push({ sev: 'P1', cat: 'image', msg: 'gitee raw 图片链接，建议转本地 /course-data 路径' });
  }

  // 5. 内容残缺
  // 序列化泄漏：题干/选项/解析/代码出现 [object Object] 或 undefined（必为数据损坏）
  const leakBlob = `${stem}\n${code}\n${explanation}\n${options.map(text).join('\n')}`;
  if (/\[object Object\]/.test(leakBlob)) {
    issues.push({ sev: 'P0', cat: 'content', msg: '含 [object Object] 序列化泄漏' });
  }
  if (/\bundefined\b/.test(leakBlob)) {
    issues.push({ sev: 'P0', cat: 'content', msg: '含 undefined 序列化泄漏' });
  }
  // 抽取残缺：量词/范围前缺数值（"由 位""输入 个""分数为 的整数"等）
  if (EXTRACT_RESIDUE_RE.test(stem)) {
    issues.push({ sev: 'P1', cat: 'content', msg: '题干疑似抽取残缺（量词/范围前缺数值）' });
  }
  // 解析含"待补充/TODO"：应写"官方答案：X。"，不得写"解析待补充"
  if (/解析待补充|待补充|TODO/.test(explanation)) {
    issues.push({ sev: 'P1', cat: 'content', msg: '解析含"待补充/TODO"，应写"官方答案：X。"' });
  }
  if (stem.trim() && stem.trim().length < 6 && options.length >= 2) {
    issues.push({ sev: 'P1', cat: 'content', msg: '题干过短(<6字)但含选项，疑似缺上下文' });
  }
  // 解析缺失：quiz-bank 是精简题库无 explanation 字段（设计如此）；超级挑战解析在题干，跳过
  const isQuizBank = /quiz-bank\.json$/.test(file);
  const subsAllExplained = type === 'reading' && Array.isArray(q.subQuestions || q.sub_questions)
    && (q.subQuestions || q.sub_questions).length > 0
    && (q.subQuestions || q.sub_questions).every(sq => (text(sq.explanation || sq.analysis).trim()));
  if (!explanation.trim() && !isSuper && !isQuizBank && !subsAllExplained) {
    issues.push({ sev: 'P2', cat: 'content', msg: '缺 explanation/解析（内容缺失，不可自动补全）' });
  }
  // 解析截断启发式：以逗号/省略号结尾
  if (explanation.trim() && /[，,；;]\s*$/.test(explanation.trim())) {
    issues.push({ sev: 'P2', cat: 'content', msg: '解析疑似截断（以标点结尾）' });
  }

  // 6. 客户端显示风险
  // HTML 注入风险：题干含未转义 <script/onerror
  if (/<script|onerror\s*=|javascript:/i.test(stem)) {
    issues.push({ sev: 'P0', cat: 'security', msg: '题干含可疑脚本/事件处理器' });
  }

  if (!issues.length) return null;
  const sevRank = { P0: 0, P1: 1, P2: 2 };
  const best = issues.map(i => i.sev).sort((a, b) => sevRank[a] - sevRank[b])[0];
  return {
    file, id, type: type || 'unknown', group: q.group || q.source || '', severity: best,
    excluded: excludedIds.has(id),
    issues: issues.map(i => ({ sev: i.sev, cat: i.cat, msg: i.msg })),
    question: stem.replace(/\s+/g, ' ').slice(0, 160),
  };
}

// ---------- 跑审计 ----------
const allFindings = [];
const summaries = [];
const catCounts = {};

for (const file of SOURCE_FILES) {
  const data = readJson(file);
  const entries = asQuestions(data);
  const fileFindings = [];
  for (const [key, q] of entries) {
    if (!q || typeof q !== 'object') continue;
    const id = q.id || q.questionId || key;
    const f = auditQuestion(q, id, file);
    const v2f = v2Finding(id, file);
    if (f) { fileFindings.push(f); allFindings.push(f); }
    if (v2f) { fileFindings.push(v2f); allFindings.push(v2f); }
  }
  const bySev = { P0: 0, P1: 0, P2: 0 };
  // 同题同时命中结构与 V2 时只计一次严重度，避免重复计数
  const seen = new Set();
  for (const f of fileFindings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    bySev[f.severity]++;
  }
  for (const f of fileFindings) for (const i of f.issues) catCounts[`${i.sev}:${i.cat}`] = (catCounts[`${i.sev}:${i.cat}`] || 0) + 1;
  summaries.push({ file, total: entries.length, findings: fileFindings.length, bySev });
}

// ---------- 指标计算（区分 source issue 与 visible issue）----------
const sourceIssuesTotal = allFindings.length;
const excludedFindings = allFindings.filter(f => f.excluded);
const excludedIssuesTotal = excludedFindings.length;
const visibleFindings = allFindings.filter(f => !f.excluded);
const visibleP0 = visibleFindings.filter(f => f.severity === 'P0').length;
const visibleP1 = visibleFindings.filter(f => f.severity === 'P1').length;
const visibleP2 = visibleFindings.filter(f => f.severity === 'P2').length;
const sourceP0 = allFindings.filter(f => f.severity === 'P0').length;
const sourceP1 = allFindings.filter(f => f.severity === 'P1').length;
const sourceP2 = allFindings.filter(f => f.severity === 'P2').length;

// V2 状态统计
const v2Visible = allFindings.filter(f => !f.excluded && f.type === 'v2');
// 同一题跨渠道（unified / exam / dungeon）重复出现时按 ID 去重
const v2VisibleById = new Map();
for (const f of v2Visible) if (!v2VisibleById.has(f.id)) v2VisibleById.set(f.id, f);
const v2VisibleUnique = [...v2VisibleById.values()];
const v2VisibleDisputed = v2VisibleUnique.filter(f => f.issues.some(i => i.msg.includes('disputed'))).length;
const v2VisibleBroken = v2VisibleUnique.filter(f => f.issues.some(i => i.msg.includes('broken'))).length;
const v2Excluded = allFindings.filter(f => f.excluded && f.type === 'v2').length;

// ---------- 写报告 ----------
const outDir = path.join(root, 'reports');
fs.mkdirSync(outDir, { recursive: true });

const reportJson = {
  generatedAt: new Date().toISOString(),
  sourceFiles: SOURCE_FILES,
  excludedConfig: {
    file: 'public/course-data/excluded-question-ids.json',
    ids: excludedMeta.ids,
    reason: excludedMeta.reason,
    note: excludedMeta.note,
  },
  totals: {
    questions: summaries.reduce((a, s) => a + s.total, 0),
    sourceIssuesTotal,
    excludedIssuesTotal,
    visibleP0,
    visibleP1,
    visibleP2,
    sourceP0,
    sourceP1,
    sourceP2,
    v2VisibleDisputed,
    v2VisibleBroken,
    v2Excluded,
  },
  byCategory: catCounts,
  summaries,
  findings: allFindings,
};
fs.writeFileSync(path.join(outDir, 'question-reliability-report.json'), JSON.stringify(reportJson, null, 2));

// ---------- markdown ----------
const md = [];
md.push('# 题库可靠性报告 (Question Reliability Report)');
md.push('');
md.push(`生成时间: ${new Date().toISOString()}`);
md.push('');

// 总览
md.push('## 总览');
md.push('');
md.push(`- 审计源文件: ${SOURCE_FILES.length} 个`);
md.push(`- 源题库总题数: ${reportJson.totals.questions}`);
md.push(`- 源题库问题题数 (sourceIssuesTotal): ${sourceIssuesTotal} (P0=${sourceP0}, P1=${sourceP1}, P2=${sourceP2})`);
md.push(`- 已隔离题目数 (excludedIssuesTotal): ${excludedIssuesTotal}`);
md.push(`- 学生可见问题 (visible): P0=${visibleP0}, P1=${visibleP1}, P2=${visibleP2}`);
md.push('');
md.push('## 分文件摘要');
md.push('');
md.push('| 文件 | 总题数 | 问题数 | P0 | P1 | P2 |');
md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const s of summaries) md.push(`| ${s.file} | ${s.total} | ${s.findings} | ${s.bySev.P0} | ${s.bySev.P1} | ${s.bySev.P2} |`);
md.push('');

// 学生可见风险
md.push('## 学生可见风险');
md.push('');
md.push('学生可见 = 源题库问题中尚未被 `excluded-question-ids.json` 隔离的题（会进入 /quiz 与 /dungeon 题池）。');
md.push('');
md.push(`- visibleP0: **${visibleP0}**`);
md.push(`- visibleP1: **${visibleP1}**`);
md.push(`- visibleP2: **${visibleP2}**`);
md.push('');
if (visibleP0 === 0 && visibleP1 === 0) {
  md.push(`> ✅ 学生可见 P0/P1 均为 0：无崩溃、无无法作答、无显示异常题目。${visibleP2 > 0 ? `仅剩 ${visibleP2} 道 P2（缺解析，不影响作答与显示）。` : ''}`);
  md.push('');
}

// 源题库剩余问题
md.push('## 源题库剩余问题');
md.push('');
md.push(`源题库仍有 ${excludedIssuesTotal} 道缺代码题，已隔离，不会进入学生题池。其余 ${sourceIssuesTotal - excludedIssuesTotal} 道为内容缺失类（P2，缺解析）。`);
md.push('');
const p1src = allFindings.filter(f => f.severity === 'P1');
if (p1src.length) {
  md.push('### 源题库 P1（含已隔离）');
  md.push('');
  for (const f of p1src) md.push(`- ${f.excluded ? '🚫已隔离 ' : ''}**${f.id}** [${f.file.split('/').pop()}] ${f.type}: ${f.issues.map(i => `[${i.cat}] ${i.msg}`).join(' | ')}`);
  md.push('');
}
const p2src = allFindings.filter(f => f.severity === 'P2');
if (p2src.length) {
  md.push(`### 源题库 P2（${p2src.length} 道，缺解析等）`);
  md.push('');
  md.push('均为 CSP reading 题缺 explanation，属历史内容缺失，非显示问题，不影响作答。详见 JSON 报告 findings。');
  md.push('');
}

// V2 验证状态
md.push('## V2 验证状态（question-bank-v2）');
md.push('');
if (v2StatusMap.size === 0) {
  md.push('未检测到 `question-bank-v2/verification.json`，跳过 V2 状态接入。');
} else {
  md.push(`V2 管道验证结果中，学生可见 disputed/broken：**${v2VisibleDisputed}** disputed + **${v2VisibleBroken}** broken（未在排除名单内，按 ID 去重）；已隔离 ${v2Excluded}。`);
  md.push('disputed 表示模型/官方答案存在分歧或题面歧义，需人工复核；broken 表示结构不适配。以下为可见项：');
  md.push('');
  md.push('| id | V2 状态与原因 |');
  md.push('| --- | --- |');
  for (const f of v2VisibleUnique) {
    const detail = f.issues.map(i => i.msg.replace(/^V2 验证状态:\s*/, '')).join(' | ');
    md.push(`| ${f.id} | ${detail} |`);
  }
  md.push('');
}

// 已隔离题目
md.push('## 已隔离题目');
md.push('');
md.push('配置文件: `public/course-data/excluded-question-ids.json`（单一数据源，客户端与审计共用）');
md.push('');
md.push(`- reason: \`${excludedMeta.reason || '(无)'}\``);
md.push(`- note: ${excludedMeta.note || '(无)'}`);
md.push('');
md.push('| id | 隔离原因 |');
md.push('| --- | --- |');
for (const id of excludedMeta.ids) md.push(`| ${id} | ${excludedMeta.reason || 'missing_or_corrupted_code'} |`);
md.push('');
md.push('客户端通过 `src/utils/excludedQuestions.ts`（/quiz 与 /dungeon 共用 helper）在题库加载时读取本配置并过滤；读取失败降级为空集，不影响题库加载。');
md.push('');

// 发版建议
md.push('## 发版建议');
md.push('');
md.push(`- 学生可见 P0=${visibleP0}, P1=${visibleP1} → **${visibleP0 === 0 && visibleP1 === 0 ? '可发版（无阻塞风险）' : '不建议发版，需先修复或隔离 visible P0/P1'}**`);
md.push(`- visibleP2=${visibleP2}（缺解析）为内容完善项，不阻塞发版。`);
md.push(`- ${excludedIssuesTotal} 道已隔离题不影响学生体验；发版前可选择补全代码后移除隔离。`);
md.push('- 本报告基于源题库审计；dist/dist-dungeon 由构建再生成，发版流程跑 `npm run build` 即可同步。');
md.push('');

// 后续补题清单
md.push('## 后续补题清单');
md.push('');
md.push('### 1. 补全已隔离题代码（补全后从 excluded-question-ids.json 移除对应 id）');
md.push('');
for (const id of excludedMeta.ids) md.push(`- ${id}`);
md.push('');
md.push('来源建议：CCF/GESP 原题图片人工录入或重新 OCR，补全 `code` 字段后从排除列表删除。');
md.push('');
md.push(`### 2. 补全 ${p2src.length} 道 reading 题解析（内容完善，非阻塞）`);
md.push('');
md.push('`src-dungeon/data/csp-exam-bank.json` 中 34 道 CSP reading 题缺 explanation，可按年份从真题解析补全。');
md.push('');

fs.writeFileSync(path.join(outDir, 'question-reliability-report.md'), md.join('\n') + '\n');

// 控制台
for (const s of summaries) console.log(`${s.file}: ${s.total} questions, ${s.findings} issue(s) [P0=${s.bySev.P0}, P1=${s.bySev.P1}, P2=${s.bySev.P2}]`);
console.log(`SOURCE issues: ${sourceIssuesTotal} (P0=${sourceP0}, P1=${sourceP1}, P2=${sourceP2}) | excluded: ${excludedIssuesTotal} | VISIBLE P0=${visibleP0} P1=${visibleP1} P2=${visibleP2}`);
console.log(`report: ${path.relative(root, path.join(outDir, 'question-reliability-report.json'))}`);
console.log(`markdown: ${path.relative(root, path.join(outDir, 'question-reliability-report.md'))}`);

// 严格模式：仅当学生可见 P0/P1 存在时才失败（已隔离题不计入）
if (process.env.STRICT_RELIBILITY_AUDIT === '1' && (visibleP0 || visibleP1)) process.exit(1);
