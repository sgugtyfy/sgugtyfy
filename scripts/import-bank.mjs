import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Import only the checked-in public source snapshots; never fetch on page load.
export function importBank() {
  const manifest = JSON.parse(fs.readFileSync('sources/manifest.json', 'utf8'));
  const questions = [];
  const duplicateMap = new Map();
  const warnings = [];
  let sourceCount = 0;
  for (const chapter of manifest.chapters) {
    const bytes = fs.readFileSync(`sources/${chapter.file}`);
    const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (sha !== chapter.sha) throw new Error(`Source integrity mismatch: ${chapter.file}`);
    const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    const blocks = [];
    const header = chapter.id === 'chapter-12' ? /^(\d+)(?=[\u3400-\u9fff])/ : /^(\d+)[.．、]\s*/;
    for (const [lineIndex, line] of lines.entries()) {
      const match = line.match(header);
      if (match) blocks.push({ number: Number(match[1]), start: lineIndex, lines: [line.slice(match[0].length)] });
      else if (blocks.length) blocks.at(-1).lines.push(line);
      else if (line.trim()) throw new Error(`Unassigned source text: ${chapter.file}:${lineIndex + 1}`);
    }
    if (blocks.length !== chapter.count) throw new Error(`Wrong source count: ${chapter.file}`);
    for (const [blockIndex, block] of blocks.entries()) {
      const numberMismatch = block.number !== blockIndex + 1;
      if (numberMismatch && !chapter.numberingExceptions?.some(e => e.position === blockIndex + 1 && e.number === block.number)) throw new Error(`Unexpected question numbering gap: ${chapter.file} ${block.number}`);
      if (numberMismatch) warnings.push(`${chapter.file}: record ${blockIndex + 1} is numbered ${block.number} in source`);
      sourceCount++;
      const end = (blocks[blockIndex + 1]?.start ?? lines.length);
      const raw = lines.slice(block.start, end).join('\n').trim();
      const body = block.lines.filter(line => line.trim()).map(line => line.trim());
      const firstOption = body.findIndex(line => /^A(?:\s|[、.．]|[\u3400-\u9fff（(])/.test(line));
      const stemLines = firstOption === -1 ? body : body.slice(0, firstOption);
      const options = [];
      const labels = [];
      if (firstOption !== -1) {
        for (const line of body.slice(firstOption)) {
          const match = line.match(/^([A-J])(?:[\s、.．]*)(.*)$/);
          const expected = String.fromCharCode(65 + options.length);
          if (match && match[1] === expected) {
            labels.push(match[1]); options.push(match[2].trim());
          } else if (options.length) options[options.length - 1] += '\n' + line;
          else throw new Error(`Unrecognized option: ${chapter.file} #${block.number}`);
        }
      }
      let stem = stemLines.join('\n');
      let type, answer;
      const isChoiceAnswer = value => {
        const letters = value.replace(/[\s,，、]/g, '');
        return new Set(letters).size === letters.length && [...letters].every(letter => labels.includes(letter));
      };
      const choices = [...stem.matchAll(/[（(]\s*([A-J](?:[\s,，、]*[A-J])*)\s*[)）]/g)].filter(match => isChoiceAnswer(match[1]));
      const boolean = [...stem.matchAll(/[（(]\s*([√✓×✕])\s*[)）]/g)];
      if (options.length) {
        answer = choices.map(match => match[1].replace(/[\s,，、]/g, '')).join('');
        if (!answer) throw new Error(`Choice has no answer: ${chapter.file} #${block.number}`);
        stem = stem.replace(/[（(]\s*([A-J](?:[\s,，、]*[A-J])*)\s*[)）]/g, (whole, value) => isChoiceAnswer(value) ? '（ ）' : whole);
        type = answer.length > 1 ? '多选题' : '单选题';
        if (new Set(answer).size !== answer.length) warnings.push(`${chapter.file} #${block.number}: repeated answer letter`);
        for (const letter of answer) if (!labels.includes(letter)) throw new Error(`Answer outside choices: ${chapter.file} #${block.number}: ${answer}`);
      } else if (boolean.length) {
        type = '判断题';
        answer = /[√✓]/.test(boolean.at(-1)[1]) ? '正确' : '错误';
        stem = stem.replace(/[（(]\s*[√✓×✕]\s*[)）]/g, '').trim();
      } else {
        // In these source files square brackets mark fill-ins or reference answers.
        const fields = [...stem.matchAll(/\[([^\]]+)\]/g)].filter(match => !/^[A-Z]$/.test(match[1]));
        const isOpen = /^(?:请(?:说明|列举|尝试|谈谈|简述)|谈谈|列举)/.test(stem);
        if (isOpen) {
          type = '简答题';
          if (fields.length) {
            answer = fields.map(match => match[1]).join('\n');
            stem = stem.slice(0, fields[0].index).trim();
          } else if (stemLines.length > 1) {
            stem = stemLines[0]; answer = stemLines.slice(1).join('\n');
          } else throw new Error(`Short answer not found: ${chapter.file} #${block.number}`);
        } else if (fields.length) {
          type = '填空题';
          const reference = fields.map(match => match[1]);
          let blank = 0;
          stem = stem.replace(/\[([^\]]+)\]/g, (whole, value) => /^[A-Z]$/.test(value) ? whole : fields.length > 1 ? `（${++blank}）____` : '____');
          answer = reference.length > 1 ? reference.map((text, index) => `${index + 1}. ${text}`).join('\n') : reference[0];
        } else throw new Error(`Unrecognized question: ${chapter.file} #${block.number}`);
      }
      const source = {
        file: chapter.file, chapter: chapter.code, number: block.number,
        lineStart: block.start + 1, lineEnd: end,
        url: `${manifest.repository}/blob/main/${encodeURIComponent(chapter.file)}#L${block.start + 1}-L${end}`,
        raw
      };
      const q = { id: `${chapter.id}-q${blockIndex + 1}`, category: chapter.id, type, stem, options, answer, note: numberMismatch ? `源文件第 ${blockIndex + 1} 条标为“第 ${block.number} 题”；此处保留原题号，可查看原文核对。` : null, sources: [source] };
      // Only collapse identical wording, options and answer. Keep different versions.
      const key = JSON.stringify([type, stem, options, answer]).replace(/\s/g, '').normalize('NFKC');
      if (duplicateMap.has(key)) duplicateMap.get(key).sources.push(source);
      else { duplicateMap.set(key, q); questions.push(q); }
    }
  }
  questions.forEach((q, i) => q.index = i + 1);
  const overrides = JSON.parse(fs.readFileSync('answer-overrides.json', 'utf8'));
  for (const [id, override] of Object.entries(overrides)) {
    const q = questions.find(q => q.id === id);
    if (!q || typeof override.answer !== 'string' || !override.answer.trim()) throw new Error(`Invalid answer correction: ${id}`);
    q.correction = {originalAnswer: q.answer, note: override.note || '站内答案校订'};
    q.answer = override.answer;
  }
  return {
    meta: { repository: manifest.repository, author: 'Oldmemory1', sourceCount, sourceFiles: manifest.chapters.length, importedOn: manifest.importedOn, warnings },
    categories: manifest.chapters.map(c => ({id:c.id, code:c.code, title:c.title, file:c.file})),
    questions
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const bank = importBank();
  fs.writeFileSync('questions.js', '/* Generated from sources/*.txt by scripts/import-bank.mjs. */\nwindow.QUESTION_BANK = '+JSON.stringify(bank,null,2)+';\n');
  console.log(`Imported ${bank.meta.sourceCount} source questions → ${bank.questions.length} records in ${bank.categories.length} chapters.`);
  if (bank.meta.warnings.length) console.log(bank.meta.warnings.join('\n'));
}
