'use strict';
(() => {
  const { meta: bankMeta, categories, questions } = window.QUESTION_BANK;
  const list = document.querySelector('#question-list');
  const search = document.querySelector('#search');
  const dialog = document.querySelector('#source-dialog');
  const resultCount = document.querySelector('#result-count');
  const byId = new Map(questions.map(q => [q.id, q]));
  const nodes = new Map();
  const sections = new Map();
  const topicLinks = new Map();
  let selectedType = 'all';
  let answersHidden = false;
  let activeTerm = '';
  let sourceOpener;
  const categoryNames = new Map(categories.map(c => [c.id, `${c.code} ${c.title}`]));

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text, action, id) {
    const node = element('button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    node.dataset.id = id;
    return node;
  }
  function renderCard(q) {
    const card = element('article', 'question-card');
    card.id = q.id;
    card.setAttribute('aria-labelledby', `${q.id}-stem`);
    const meta = element('div', 'question-meta');
    meta.append(element('span', 'question-number', String(q.index).padStart(3, '0')));
    meta.append(element('span', `type-tag ${q.type === '判断题' ? 'judge' : q.type === '填空题' ? 'fill' : ''}`, q.type));
    meta.append(element('span', 'chapter-reference', `${q.sources[0].chapter} · 原第 ${q.sources[0].number} 题`));
    const source = button('source-button', '查看原文 ↗', 'source', q.id);
    source.setAttribute('aria-label', `查看第 ${q.index} 题的来源原文`);
    meta.append(source);
    const stem = element('h3', 'question-stem', q.stem);
    stem.id = `${q.id}-stem`;
    stem.dataset.original = q.stem;
    card.append(meta, stem);
    const searchable = [stem];
    if (q.options.length) {
      const options = element('ol', 'options');
      for (const [index, text] of q.options.entries()) {
        const option = element('li');
        const content = element('span', 'option-content', text);
        content.dataset.original = text;
        option.append(element('span', 'option-letter', String.fromCharCode(65 + index)), content);
        options.append(option);
        searchable.push(content);
      }
      card.append(options);
    }
    if (q.note) card.append(element('p', 'question-note', q.note));
    const answerRow = element('div', 'answer-row');
    const answer = element('span', `answer-text${['简答题', '填空题'].includes(q.type) ? ' long-answer' : ''}`, q.type === '排序题' ? [...q.answer].join(' → ') : q.answer);
    answer.id = `${q.id}-answer`;
    const toggle = button('single-answer-toggle', '收起', 'answer', q.id);
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-controls', answer.id);
    toggle.setAttribute('aria-label', `收起第 ${q.index} 题答案`);
    answerRow.append(element('span', 'answer-label', '参考答案'), answer, toggle);
    card.append(answerRow);
    nodes.set(q.id, { card, searchable, toggle });
    return card;
  }

  document.querySelector('#total-count').textContent = questions.length;
  document.querySelector('#sidebar-total').textContent = questions.length;
  document.querySelector('#topic-count').textContent = categories.length;
  document.querySelector('#source-summary').textContent = `${bankMeta.sourceFiles} 份章节习题 · ${bankMeta.sourceCount} 道原题 · 来源快照 ${bankMeta.importedOn}`;
  const nav = document.querySelector('#topic-nav');
  for (const [i, category] of categories.entries()) {
    const group = questions.filter(q => q.category === category.id);
    const section = element('section', 'topic-section');
    section.id = `topic-${category.id}`;
    const heading = element('div', 'section-heading');
    const h2 = element('h2', '', category.title);
    h2.id = `${category.id}-title`;
    section.setAttribute('aria-labelledby', h2.id);
    const count = element('span', 'section-count', `${group.length} 题`);
    heading.append(element('span', 'section-number', category.code), h2, count, element('span', 'section-line'));
    section.append(heading, ...group.map(renderCard));
    list.append(section);
    sections.set(category.id, { section, count, group });
    const link = element('a', 'topic-link');
    link.href = `#topic-${category.id}`;
    link.title = `${category.code}习题 · ${group.length}题`;
    link.append(element('span', 'topic-index', category.code), element('span', '', category.title), element('span', 'count', group.length));
    nav.append(link);
    topicLinks.set(category.id, link);
  }

  function highlight(node, term) {
    const text = node.dataset.original;
    node.replaceChildren();
    if (!term) { node.textContent = text; return; }
    const lower = text.toLocaleLowerCase();
    let from = 0;
    let match;
    while ((match = lower.indexOf(term, from)) !== -1) {
      node.append(document.createTextNode(text.slice(from, match)), element('mark', '', text.slice(match, match + term.length)));
      from = match + term.length;
    }
    node.append(document.createTextNode(text.slice(from)));
  }
  function filterQuestions() {
    const term = search.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    for (const { section, count, group } of sections.values()) {
      let groupCount = 0;
      for (const q of group) {
        const { card, searchable } = nodes.get(q.id);
        const matches = (selectedType === 'all' || selectedType === q.type) && (!term || `${q.stem} ${q.options.join(' ')} ${q.note || ''} ${categoryNames.get(q.category)}`.toLocaleLowerCase().includes(term));
        card.hidden = !matches;
        if (matches) groupCount++;
        if (activeTerm !== term) searchable.forEach(node => highlight(node, term));
      }
      section.hidden = !groupCount;
      count.textContent = `${groupCount} 题`;
      const link = topicLinks.get(group[0].category);
      link.hidden = !groupCount;
      link.querySelector('.count').textContent = groupCount;
      visibleCount += groupCount;
    }
    activeTerm = term;
    resultCount.textContent = visibleCount === questions.length ? `共 ${questions.length} 题 · 一页展示` : `找到 ${visibleCount} / ${questions.length} 题`;
    document.querySelector('#empty-state').hidden = visibleCount > 0;
    document.querySelector('.all-link').classList.add('active');
    topicLinks.forEach(link => { link.classList.remove('active'); link.removeAttribute('aria-current'); });
  }
  search.addEventListener('input', filterQuestions);
  document.querySelector('.type-filters').addEventListener('click', event => {
    const target = event.target.closest('[data-type]');
    if (!target) return;
    selectedType = target.dataset.type;
    document.querySelectorAll('[data-type]').forEach(node => {
      const active = node.dataset.type === selectedType;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', active);
    });
    filterQuestions();
  });
  document.querySelector('#reset-filters').addEventListener('click', () => {
    search.value = '';
    document.querySelector('[data-type="all"]').click();
    search.focus();
  });
  function setAnswer(q, hidden) {
    const { card, toggle } = nodes.get(q.id);
    card.classList.toggle('answer-concealed', hidden);
    card.querySelector('.answer-text').hidden = hidden;
    toggle.textContent = hidden ? '查看答案' : '收起';
    toggle.setAttribute('aria-expanded', !hidden);
    toggle.setAttribute('aria-label', `${hidden ? '查看' : '收起'}第 ${q.index} 题答案`);
  }
  document.querySelector('#answer-toggle').addEventListener('click', event => {
    answersHidden = !answersHidden;
    questions.forEach(q => setAnswer(q, answersHidden));
    event.currentTarget.setAttribute('aria-pressed', answersHidden);
    event.currentTarget.querySelector('span:last-child').textContent = answersHidden ? '显示答案' : '隐藏答案';
  });
  function showSource(q, opener) {
    sourceOpener = opener;
    document.querySelector('#source-title').textContent = `第 ${String(q.index).padStart(3, '0')} 题 · 来源原文`;
    const references = q.sources.map(source => {
      const section = element('section', 'source-reference');
      const heading = element('h3', '', `${source.file} · 原第 ${source.number} 题`);
      const text = element('pre', 'source-raw', source.raw);
      const links = element('div', 'source-links');
      const upstream = element('a', '', '在 GitHub 查看原文 ↗');
      upstream.href = source.url;
      upstream.target = '_blank';
      upstream.rel = 'noopener noreferrer';
      const local = element('a', '', '下载本章原始题库 ↓');
      local.href = `sources/${encodeURIComponent(source.file)}`;
      local.download = source.file;
      links.append(upstream, local);
      section.append(heading, text, links);
      return section;
    });
    document.querySelector('#source-content').replaceChildren(...references);
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  list.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    const q = byId.get(target.dataset.id);
    if (target.dataset.action === 'source') showSource(q, target);
    else setAnswer(q, !nodes.get(q.id).card.classList.contains('answer-concealed'));
  });
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; sourceOpener?.focus({ preventScroll: true }); });
  document.querySelector('#print-button').addEventListener('click', () => window.print());
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !dialog.open && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      event.preventDefault(); search.focus();
    }
  });
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    document.querySelector('.all-link').classList.remove('active');
    topicLinks.forEach(node => { node.classList.toggle('active', node === link); if (node === link) node.setAttribute('aria-current', 'location'); else node.removeAttribute('aria-current'); });
  });
  document.querySelector('.all-link').addEventListener('click', () => {
    search.value = '';
    document.querySelector('[data-type="all"]').click();
  });
  filterQuestions();
})();
