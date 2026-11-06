import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const cleanTitle = value => String(value).replace(/[\uE000-\uF8FF]/g, '').replace(/\s+/g, ' ').trim();
export function normalizeEnglish(input, inputSha256) {
  if (input.format !== 'study-bank-course-v1' || input.meta?.correctAnswersOnly !== true || input.meta?.complete !== true) throw new Error('需要已完整采集且仅含正确答案的课程导出');
  const selected = input.meta.selectedExerciseIds, completed = input.meta.completedExerciseIds;
  if (!Array.isArray(selected) || !Array.isArray(completed) || new Set(selected).size !== input.meta.catalogCount || selected.some(id => !completed.includes(id))) throw new Error('课程目录采集不完整');
  if (input.categories.length !== input.meta.catalogCount) throw new Error('章节数与目录不一致');
  const categories = input.categories.map(category => {
    const parts = cleanTitle(category.title).split(' / ');
    return {id: category.id, code: category.code, group: parts.length > 1 ? parts[0] : '', title: parts.length > 2 ? parts.slice(1, -1).join(' / ') : parts.at(-1)};
  });
  const questions = [], duplicates = new Map(), ids = new Set();
  for (const q of input.questions) {
    if (ids.has(q.id) || !categories.some(c => c.id === q.category) || !q.stem?.trim() || !q.answer?.trim() || !Array.isArray(q.options) || q.evidence?.label !== '正确答案') throw new Error(`题目不完整或证据无效：${q.id}`);
    ids.add(q.id);
    if (q.type === '单选题') {
      if (!/^[A-Z]$/.test(q.answer) || q.options.length < 2 || q.answer.charCodeAt(0) - 65 >= q.options.length) throw new Error(`选项与答案不符：${q.id}`);
    } else if (q.type === '判断题') {
      if (!['正确', '错误'].includes(q.answer) || q.options.length) throw new Error(`判断答案无效：${q.id}`);
    } else if (q.type === '填空题') {
      if (!q.blanks?.length || q.blanks.some(value => typeof value !== 'string' || !value.trim()) || q.options.length) throw new Error(`填空答案不完整：${q.id}`);
    } else throw new Error(`未支持的导出题型：${q.type}`);
    const sources = q.sources.map(source => {
      const url = new URL(source.url);
      if (url.origin !== 'https://www.xuetangx.com' || !url.pathname.endsWith('/exercise/' + q.category) || !source.raw?.trim() || !Number.isInteger(source.number)) throw new Error(`来源无效：${q.id}`);
      return {chapter: cleanTitle(source.chapter), number: source.number, url: source.url, raw: source.raw};
    });
    if (!sources.length) throw new Error(`缺少来源：${q.id}`);
    const record = {id: q.id, index: questions.length + 1, category: q.category, type: q.type, stem: q.stem, options: q.options, answer: q.answer, ...(q.blanks ? {blanks: q.blanks} : {}), sources};
    const key = JSON.stringify([q.category, q.type, q.stem, q.options, q.answer]);
    if (duplicates.has(key)) duplicates.get(key).sources.push(...sources);
    else { duplicates.set(key, record); questions.push(record); }
  }
  for (const category of categories) {
    const numbers = input.questions.filter(q => q.category === category.id).flatMap(q => q.sources.map(s => s.number)).sort((a,b) => a-b);
    if (!numbers.length || numbers.some((n,i) => n !== i+1)) throw new Error(`章节题号不完整：${category.code}`);
  }
  return {meta: {title: input.course.title, provider: input.course.provider, sourceCount: input.questions.length, collectedOn: input.meta.collectedOn, correctAnswersOnly: true, complete: true, inputSha256}, categories, questions};
}
export function readEnglish() { return JSON.parse(fs.readFileSync('data/intercultural-english.json', 'utf8')); }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let bank;
  if (process.argv[2]) {
    const raw = fs.readFileSync(process.argv[2]);
    bank = normalizeEnglish(JSON.parse(raw.toString('utf8')), crypto.createHash('sha256').update(raw).digest('hex'));
    fs.mkdirSync('data', {recursive: true});
    fs.writeFileSync('data/intercultural-english.json', JSON.stringify(bank, null, 2) + '\n');
  } else bank = readEnglish();
  fs.writeFileSync('english-questions.js', '/* Generated from data/intercultural-english.json. */\nwindow.ENGLISH_QUESTION_BANK = ' + JSON.stringify(bank, null, 2) + ';\n');
  console.log(`Imported ${bank.questions.length} English questions across ${bank.categories.length} lessons.`);
}
