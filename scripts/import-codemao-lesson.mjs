import fs from 'node:fs';
import path from 'node:path';

const lessonOrder = Number(process.argv[2]);
if (!Number.isInteger(lessonOrder)) {
  throw new Error('Usage: node scripts/import-codemao-lesson.mjs <lesson-order>');
}

const input = await new Promise((resolve, reject) => {
  let body = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { body += chunk; });
  process.stdin.on('end', () => resolve(body));
  process.stdin.on('error', reject);
});

const response = JSON.parse(input);
const sourceCourse = Array.isArray(response.data) ? response.data[0] : response.data;
if (!sourceCourse?.linkList) throw new Error(`P${lessonOrder}: invalid Codemao course response`);

const bucketByLinkName = {
  OJ: 'inClassCodes',
  '课后作业': 'homework',
  '课后拓展': 'extended',
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;|&#60;/gi, '<')
    .replace(/&gt;|&#62;/gi, '>')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(value = '') {
  if (!value) return '';
  return decodeEntities(String(value)
    .replace(/<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi, '\n题目配图：$1\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '· ')
    .replace(/<sup\b[^>]*>(.*?)<\/sup>/gi, '^$1')
    .replace(/<sub\b[^>]*>(.*?)<\/sub>/gi, '_$1')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function videosOf(detail) {
  const urls = [
    ...(detail.tipsV2List || []).map(item => item.url),
    ...(detail.tipsContent?.tipsMaterials || []).map(item => item.url),
  ].filter(Boolean);
  return [...new Set(urls)];
}

const sourceBuckets = { inClassCodes: [], homework: [], extended: [] };
for (const link of sourceCourse.linkList) {
  const bucket = bucketByLinkName[link.name];
  if (!bucket) continue;
  for (const step of link.normalDetail?.stepList || []) {
    if (step.ojCppDetail) sourceBuckets[bucket].push(step.ojCppDetail);
  }
}

const file = path.resolve('public/course-data/lessons.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const lesson = (data.stages || []).flatMap(stage => stage.lessons || [])
  .find(item => item.order === lessonOrder);
if (!lesson) throw new Error(`P${lessonOrder}: local lesson not found`);

const localFlat = ['inClassCodes', 'homework', 'extended']
  .flatMap(bucket => lesson[bucket] || []);
const sourceFlat = ['inClassCodes', 'homework', 'extended']
  .flatMap(bucket => sourceBuckets[bucket]);
if (localFlat.length !== sourceFlat.length) {
  throw new Error(`P${lessonOrder}: problem count differs (local ${localFlat.length}, source ${sourceFlat.length})`);
}

let sourceIndex = 0;
for (const bucket of ['inClassCodes', 'homework', 'extended']) {
  lesson[bucket] = sourceBuckets[bucket].map(detail => {
    const local = localFlat[sourceIndex++];
    const questionId = String(detail.questionId);
    const oj = detail.ojInfo || {};
    const analysis = htmlToText(detail.analysis);
    const tipsVideos = videosOf(detail);
    return {
      ...local,
      id: `codemao-${questionId}`,
      platform: 'codemao',
      pid: questionId,
      sourceQuestionId: questionId,
      title: `${questionId}-${detail.name || local.title}`,
      description: htmlToText(detail.description),
      inputFormat: htmlToText(oj.inputType),
      outputFormat: htmlToText(oj.outputType),
      dataRange: htmlToText(oj.dataRange),
      samples: (oj.example || []).map(sample => ({
        in: String(sample.in ?? ''),
        out: String(sample.out ?? ''),
      })),
      ...(analysis && analysis !== '无' ? { analysis } : {}),
      ...(tipsVideos.length ? { tipsVideos } : {}),
      ...(Number.isFinite(oj.timeLimit) ? { timeLimit: oj.timeLimit } : {}),
      ...(Number.isFinite(oj.memoryLimit) ? { memoryLimit: oj.memoryLimit } : {}),
    };
  });
}

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`P${lessonOrder}: imported ${sourceFlat.length} problems from ${sourceCourse.courseName}`);
console.log(`  OJ ${sourceBuckets.inClassCodes.length}, homework ${sourceBuckets.homework.length}, extended ${sourceBuckets.extended.length}`);
