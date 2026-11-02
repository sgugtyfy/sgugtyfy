import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { importBank } from './import-bank.mjs';
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('questions.js', 'utf8'), context);
const bank = context.window.QUESTION_BANK;
const { questions, categories, meta } = bank;
const regenerated = importBank();
assert.equal(JSON.stringify(bank), JSON.stringify(regenerated), 'Generated bank differs from checked-in sources');
assert.equal(questions.length, 475);
assert.equal(categories.length, 12);
assert.equal(meta.sourceCount, 475);
const ids = new Set(), sourceLines = new Set();
const types = ['单选题', '多选题', '判断题', '填空题', '简答题'];
for (const [i, q] of questions.entries()) {
  assert.equal(q.index, i + 1);
  assert(!ids.has(q.id), `Duplicate ID: ${q.id}`);
  ids.add(q.id);
  assert(categories.some(c => c.id === q.category));
  assert(types.includes(q.type), `Unknown type: ${q.id}`);
  assert(q.stem && q.answer, `Missing stem/answer: ${q.id}`);
  if (['单选题', '多选题'].includes(q.type)) {
    assert(q.options.length >= 2 && q.options.every(s => s.trim()), `Missing options: ${q.id}`);
    for (const letter of q.answer) assert(letter >= 'A' && letter.charCodeAt(0) - 65 < q.options.length, `Answer outside choices: ${q.id}`);
    if (q.type === '单选题') assert.equal(q.answer.length, 1);
  }
  if (q.type === '判断题') assert(['正确', '错误'].includes(q.answer));
  assert(q.sources.length);
  for (const source of q.sources) {
    assert(source.url.startsWith(meta.repository + '/blob/main/'));
    const lines = fs.readFileSync('sources/' + source.file, 'utf8').split(/\r?\n/);
    assert.equal(lines.slice(source.lineStart - 1, source.lineEnd).join('\n').trim(), source.raw);
    const key = `${source.file}:${source.lineStart}`;
    assert(!sourceLines.has(key), `Repeated source block: ${key}`);
    sourceLines.add(key);
  }
}
assert.equal(sourceLines.size, 475);
const get = id => questions.find(q => q.id === id);
assert.equal(get('chapter-10-q14').answer, 'EADBC', 'Preserve product claim ordering');
assert.equal(get('chapter-10-q19').answer, 'CEADB', 'Preserve patent writing ordering');
assert.equal(get('chapter-10-q14').type, '多选题', 'Flow-order wording remains a multiple-choice question');
assert.equal(get('chapter-10-q19').type, '多选题', 'Sequence wording remains a multiple-choice question');
assert.equal(get('chapter-3-q51').type, '单选题', 'Database sort preference is a single-choice question');
assert(get('chapter-9-q33').stem.includes('III'), 'Keep chemical oxidation state in stem');
assert.equal(get('chapter-9-q33').answer, 'D', 'Roman numerals are not answer choices');
assert(get('chapter-3-q12').stem.includes('[P]'), 'Keep bibliographic document type tag');
assert.equal(get('chapter-3-q12').answer, '中文专利');
assert.equal(get('chapter-12-q14').answer, 'AC', 'Read answers from multiple parentheses');
assert(get('chapter-9-q46').note, 'Flag duplicated numbering in source');
assert(!fs.readdirSync('sources').some(f => /\.(jpe?g|png)$/i.test(f)), 'Old screenshot assets remain');
assert(fs.readFileSync('.gitattributes', 'utf8').includes('sources/*.txt -text'), 'Source byte preservation rule missing');
for (const file of ['index.html', 'style.css', 'app.js', 'questions.js', 'favicon.svg']) assert(fs.existsSync(file));
assert(!/CSDN|原图|截图/.test(fs.readFileSync('index.html', 'utf8')), 'Old source text remains');
assert(!fs.readFileSync('Dockerfile', 'utf8').includes('game.js'));
console.log(`Verified ${questions.length} questions, ${categories.length} chapters, ${sourceLines.size} original source blocks, all 5 question types and source hashes.`);
