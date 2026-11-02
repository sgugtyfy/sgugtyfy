import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('questions.js', 'utf8'), context);
const { questions, categories } = context.window.QUESTION_BANK;
assert.equal(questions.length, 266);
assert.equal(categories.length, 11);
const ids = new Set();
const stems = new Set();
let crops = 0;
for (const [i, q] of questions.entries()) {
  assert.equal(q.index, i + 1);
  assert(!ids.has(q.id), `Duplicate ID: ${q.id}`);
  ids.add(q.id);
  assert(!stems.has(q.stem), `Duplicate stem: ${q.id}`);
  stems.add(q.stem);
  assert(categories.some(c => c.id === q.category));
  assert(['单选题', '多选题', '判断题', '填空题'].includes(q.type));
  assert(q.stem && !/undefined|NaN/.test(q.stem));
  if (q.type === '单选题' || q.type === '多选题') {
    assert(q.options.length >= 2, `Missing options: ${q.id}`);
    assert(q.options.every(s => s.trim()), `Empty option: ${q.id}`);
    if (q.answer) for (const letter of q.answer) assert(letter.charCodeAt(0) - 65 < q.options.length && letter >= 'A', `Answer out of range: ${q.id} ${q.answer}`);
  }
  if (q.type === '判断题') assert(q.answer === null || ['正确', '错误'].includes(q.answer));
  assert(q.sources.length);
  for (const s of q.sources) {
    const image = fs.readFileSync(s.image);
    assert(image.length > 1000, `Invalid source: ${s.image}`);
    assert.equal(image.readUInt16BE(0), 0xffd8, `Not JPEG: ${s.image}`);
    assert(s.start >= 0 && s.end > s.start && s.end <= 40511);
    crops++;
  }
}
for (const file of ['index.html', 'style.css', 'app.js', 'questions.js', 'favicon.svg']) assert(fs.existsSync(file), `Missing deployment asset: ${file}`);
assert(!fs.readFileSync('Dockerfile', 'utf8').includes('game.js'));
console.log(`Verified ${questions.length} questions, ${categories.length} topics, ${crops} source references; ${questions.filter(q => !q.answer).length} answers absent in source.`);
