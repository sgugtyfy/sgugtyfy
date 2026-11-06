'use strict';
(() => {
  const courses = window.COURSES;
  const $ = selector => document.querySelector(selector);
  const list = $('#question-list'), search = $('#search'), dialog = $('#source-dialog');
  const typeLabels = {单选题: '单选', 多选题: '多选', 判断题: '判断', 填空题: '填空', 简答题: '简答'};
  const entries = courses.flatMap(course => course.bank.questions.map(q => ({course, q, key: `${course.id}::${q.id}`, category: course.bank.categories.find(c => c.id === q.category)})));
  const byKey = new Map(entries.map(entry => [entry.key, entry]));
  const states = new Map(), nodes = new Map(), sections = [], topicLinks = new Map();
  let course = null, visibleEntries = [], state, sourceOpener;
  const href = (id, question) => `#/course/${id}${question ? `?question=${encodeURIComponent(question)}` : ''}`;
  const cardId = entry => `${entry.course.id}--${entry.q.id}`;
  const categoryText = category => [category.group, category.code, category.title].filter(Boolean).join(' · ');
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  for (const entry of entries) entry.searchText = normalize([entry.course.title, entry.course.term || '', categoryText(entry.category), entry.q.stem, ...entry.q.options, entry.q.answer, entry.q.note || ''].join(' '));

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function action(label, actionName, key, className) {
    const node = element('button', className, label);
    node.type = 'button'; node.dataset.action = actionName; node.dataset.key = key;
    return node;
  }
  function highlight(node, term) {
    const text = node.dataset.original;
    node.replaceChildren();
    const needle = term.trim().toLocaleLowerCase(), lower = text.toLocaleLowerCase();
    if (!needle) { node.textContent = text; return; }
    let from = 0, match;
    while ((match = lower.indexOf(needle, from)) !== -1) {
      node.append(document.createTextNode(text.slice(from, match)), element('mark', '', text.slice(match, match + needle.length)));
      from = match + needle.length;
    }
    node.append(document.createTextNode(text.slice(from)));
  }
  function card(entry, globalResult) {
    const {q, course: owner, key, category} = entry;
    const node = element('article', 'question-card'); node.id = cardId(entry); node.tabIndex = -1;
    const metadata = element('div', 'question-meta');
    metadata.append(element('span', 'question-number', String(q.index).padStart(3, '0')), element('span', `type-tag ${q.type === '判断题' ? 'judge' : q.type === '填空题' ? 'fill' : ''}`, q.type));
    if (globalResult) {
      const courseLink = element('a', 'course-badge', owner.title); courseLink.href = href(owner.id, q.id); metadata.append(courseLink);
    }
    metadata.append(element('span', 'chapter-reference', `${category.code} · 原第 ${q.sources[0].number} 题`), action('查看来源 ↗', 'source', key, 'source-button'));
    const stem = element('h3', 'question-stem', q.stem); stem.id = `${node.id}-stem`; stem.dataset.original = q.stem;
    node.setAttribute('aria-labelledby', stem.id); node.append(metadata, stem);
    const searchable = [stem];
    if (q.options.length) {
      const options = element('ol', 'options');
      q.options.forEach((text, i) => {
        const row = element('li'), content = element('span', 'option-content', text); content.dataset.original = text;
        row.append(element('span', 'option-letter', String.fromCharCode(65 + i)), content); options.append(row); searchable.push(content);
      });
      node.append(options);
    }
    if (q.note) node.append(element('p', 'question-note', q.note));
    if (q.correction) node.append(element('p', 'question-note correction-note', '此题答案已作站内校订，可在来源中核对原文。'));
    const answerRow = element('div', 'answer-row');
    const answer = element('span', `answer-text${['填空题', '简答题'].includes(q.type) ? ' long-answer' : ''}`, q.answer);
    answer.id = `${node.id}-answer`; answer.dataset.original = q.answer; searchable.push(answer);
    const toggle = action('收起', 'answer', key, 'single-answer-toggle'); toggle.setAttribute('aria-controls', answer.id);
    answerRow.append(element('span', 'answer-label', owner.id === 'intercultural-english' ? '正确答案' : '参考答案'), answer, toggle);
    node.append(answerRow);
    if (globalResult) {
      const foot = element('div', 'result-footer');
      const jump = element('a', '', '到课程中查看此题 →'); jump.href = href(owner.id, q.id);
      foot.append(element('span', '', categoryText(category)), jump); node.append(foot);
    }
    nodes.set(key, {node, toggle, answer, searchable});
    return node;
  }
  function setAnswer(entry, hidden) {
    const item = nodes.get(entry.key); if (!item) return;
    item.answer.hidden = hidden; item.node.classList.toggle('answer-concealed', hidden);
    item.toggle.textContent = hidden ? '查看答案' : '收起';
    item.toggle.setAttribute('aria-expanded', String(!hidden));
    item.toggle.setAttribute('aria-label', `${hidden ? '查看' : '收起'}第 ${entry.q.index} 题答案`);
  }
  function addSection(title, group, id, code) {
    const section = element('section', 'topic-section'); section.id = id;
    const heading = element('div', 'section-heading'), h2 = element('h2', '', title), count = element('span', 'section-count');
    h2.id = `${id}-title`; section.setAttribute('aria-labelledby', h2.id);
    if (code) heading.append(element('span', 'section-number', code));
    heading.append(h2, count, element('span', 'section-line')); section.append(heading, ...group.map(entry => card(entry, !course)));
    list.append(section); sections.push({section, count, group});
  }
  function buildQuestions() {
    list.replaceChildren(); nodes.clear(); sections.length = 0; topicLinks.clear(); $('#topic-nav').replaceChildren();
    visibleEntries = course ? entries.filter(entry => entry.course === course) : entries;
    if (course) {
      let groupName = '';
      for (const category of course.bank.categories) {
        const group = visibleEntries.filter(entry => entry.q.category === category.id);
        if (!group.length) continue;
        if (category.group && category.group !== groupName) { $('#topic-nav').append(element('p', 'topic-group', category.group)); groupName = category.group; }
        addSection(category.title, group, `topic-${course.id}-${category.id}`, category.code);
        const link = element('a', 'topic-link'); link.href = `${href(course.id)}?topic=${encodeURIComponent(category.id)}`; link.dataset.topic = category.id;
        link.append(element('span', 'topic-index', category.code), element('span', 'topic-title', category.title), element('span', 'count', group.length));
        $('#topic-nav').append(link); topicLinks.set(category.id, link);
      }
    } else {
      for (const owner of courses) addSection(owner.title, entries.filter(entry => entry.course === owner), `results-${owner.id}`);
    }
    const types = new Set(visibleEntries.map(entry => entry.q.type));
    const filters = $('#type-filters'); filters.replaceChildren();
    for (const [type, label] of [['all', '全部题型'], ...Object.entries(typeLabels).filter(([type]) => types.has(type))]) {
      const button = element('button', 'filter', label); button.type = 'button'; button.dataset.type = type; filters.append(button);
    }
  }
  function filterQuestions() {
    state.term = search.value;
    const term = normalize(state.term), terms = term.split(' ').filter(Boolean);
    const started = !!course || !!term || state.type !== 'all';
    let count = 0;
    for (const item of sections) {
      let groupCount = 0;
      for (const entry of item.group) {
        const match = started && (state.type === 'all' || entry.q.type === state.type) && terms.every(word => entry.searchText.includes(word));
        const {node, searchable} = nodes.get(entry.key); node.hidden = !match;
        if (match) { groupCount++; searchable.forEach(n => highlight(n, state.term)); }
        setAnswer(entry, state.answerOverrides.get(entry.key) ?? state.answersHidden);
      }
      item.section.hidden = !groupCount; item.count.textContent = `${groupCount} 题`; count += groupCount;
      if (course) { const link = topicLinks.get(item.group[0].q.category); link.hidden = !groupCount; link.querySelector('.count').textContent = groupCount; }
    }
    $('#search-prompt').hidden = started; $('#empty-state').hidden = !started || count > 0;
    $('#result-count').textContent = !started ? `可检索 ${entries.length} 题 · ${courses.length} 门课程` : count === visibleEntries.length && course ? `共 ${count} 题 · 一页完整展示` : `找到 ${count} / ${visibleEntries.length} 题${course ? '' : ' · 跨全部课程'}`;
    $('#answer-toggle').textContent = state.answersHidden ? '显示答案' : '隐藏答案'; $('#answer-toggle').setAttribute('aria-pressed', String(state.answersHidden));
    $('#answer-toggle').disabled = !started || !count; $('#print-button').disabled = !started || !count;
    document.querySelectorAll('[data-type]').forEach(node => { const active = node.dataset.type === state.type; node.classList.toggle('active', active); node.setAttribute('aria-pressed', String(active)); });
  }
  function renderCourses() {
    const grid = $('#course-grid'); grid.replaceChildren();
    courses.forEach((owner, i) => {
      const link = element('a', `course-card ${owner.accent}`); link.href = href(owner.id);
      const top = element('div', 'course-card-top'); top.append(element('span', 'course-label', owner.label), element('span', 'course-sequence', `COURSE / ${String(i + 1).padStart(2, '0')}`));
      const title = element('h3', '', owner.title), subtitle = element('p', 'course-subtitle', `${owner.term ? owner.term + ' · ' : ''}${owner.subtitle}`), description = element('p', 'course-description', owner.description), bottom = element('div', 'course-card-bottom');
      bottom.append(element('span', '', `${owner.bank.questions.length} 道题 · ${owner.bank.categories.length} 节练习`), element('span', 'course-enter', '进入题库 ↗'));
      link.append(top, title, subtitle, description, bottom); grid.append(link);
    });
    const select = $('#course-switch');
    courses.forEach(owner => { const option = element('option', '', owner.title); option.value = owner.id; select.append(option); });
  }
  function readRoute() {
    const hash = location.hash || '#/';
    if (/^#topic-/.test(hash)) return {id: courses[0].id, params: new URLSearchParams({topic: hash.slice(7)})};
    if (/^#chapter-\d+-q\d+$/.test(hash)) return {id: courses[0].id, params: new URLSearchParams({question: hash.slice(1)})};
    if (['#/', '#', '#top', '#question-list', '#courses'].includes(hash)) return {id: null, params: new URLSearchParams()};
    const match = hash.match(/^#\/course\/([a-z0-9-]+)(?:\?(.*))?$/);
    return match ? {id: match[1], params: new URLSearchParams(match[2] || '')} : {id: 'unknown', params: new URLSearchParams()};
  }
  function renderRoute() {
    const route = readRoute(); course = courses.find(owner => owner.id === route.id) || null;
    const missing = !!route.id && !course;
    if (dialog.open) dialog.close();
    $('#not-found').hidden = !missing;
    for (const selector of ['.hero', '#course-picker', '#search-area']) $(selector).hidden = missing || (selector === '#course-picker' && !!course);
    $('#course-sidebar').hidden = !course || missing; $('#top').classList.toggle('home-view', !course);
    if (missing) { document.title = '课程未找到 · 学研题库'; return; }
    const stateKey = course?.id || 'home';
    if (!states.has(stateKey)) states.set(stateKey, {term: '', type: 'all', answersHidden: false, answerOverrides: new Map()});
    state = states.get(stateKey);
    if (route.params.has('question') || route.params.has('topic')) { state.term = ''; state.type = 'all'; }
    search.value = state.term;
    $('#header-search').textContent = course ? '查找本课程题目 ⌕' : '查找题目 ⌕';
    $('#hero-links').hidden = !!course; $('#back-to-courses').hidden = !course;
    $('#hero-kicker').textContent = course ? `${course.term ? course.term + ' / ' : ''}COURSE QUESTION BANK` : 'A LITTLE PROGRESS, EVERY DAY';
    const title = $('#page-title'); title.replaceChildren();
    if (course) title.textContent = course.title;
    else title.append(document.createTextNode('选一门课程，'), document.createElement('br'), element('span', '', '开始今天的复习。'));
    $('#hero-description').textContent = course ? course.description + ' 所有题目一页呈现，无需翻页。' : '把零散的知识，变成有序的积累。\n按课程复习，也能从全部课程中找到你想找的那道题。';
    const stats = course ? [course.bank.questions.length, course.bank.categories.length, new Set(course.bank.questions.map(q => q.type)).size] : [courses.length, entries.length, courses.reduce((sum, owner) => sum + owner.bank.categories.length, 0)];
    const labels = course ? ['道整理题目', '节章节练习', '种习题类型'] : ['门收录课程', '道复习习题', '节章节练习'];
    ['first', 'second', 'third'].forEach((name, i) => { $(`#stat-${name}`).textContent = String(stats[i]).padStart(2, '0'); $(`#stat-${name}-label`).textContent = labels[i]; });
    $('#stat-note').textContent = course ? '所有题目，一次展开。\n按章节阅读，按关键词查找。' : '每门课程，一页读完。\n每一道题，都能找到。';
    $('#search-title').textContent = course ? '课程习题' : '全站查题'; $('#search-kicker').textContent = course ? 'READ, RECALL, REPEAT' : 'FIND A QUESTION';
    search.placeholder = course ? '搜索本课程的题干、选项、答案或章节…' : '搜索所有课程的题干、选项、答案或章节…'; search.setAttribute('aria-label', course ? `搜索${course.title}题目` : '搜索全部课程题目');
    $('#source-notice').textContent = course ? `${course.sourceLabel}；点击「查看来源」可核对题号、原文与答案。` : '搜索覆盖全部课程；输入多个关键词时，用空格分隔。所有结果一次展示。';
    if (course) { $('#sidebar-total').textContent = course.bank.questions.length; $('#course-switch').value = course.id; $('#all-questions').href = href(course.id); $('#all-questions').classList.add('active'); }
    const footer = $('#source-summary'); footer.replaceChildren();
    if (course) {
      const link = element('a', '', `${course.sourceLabel} ↗`); link.href = course.bank.meta.repository || course.bank.questions[0].sources[0].url; link.target = '_blank'; link.rel = 'noopener noreferrer'; footer.append(link);
      if (course.download) { const download = element('a', 'download-course', '下载本课程题库 ↓'); download.href = course.download; download.download = `${course.title}题库.json`; footer.append(document.createElement('br'), download); }
    } else footer.textContent = `${courses.length} 门课程 · ${entries.length} 道习题\n按课程整理，保留题目来源。`;
    document.title = course ? `${course.title}${course.term ? ' · ' + course.term : ''} · 学研题库` : '学研题库 · 课程与习题';
    buildQuestions(); filterQuestions();
    requestAnimationFrame(() => {
      const question = route.params.get('question'), topic = route.params.get('topic');
      const target = question && course ? nodes.get(`${course.id}::${question}`)?.node : topic && course ? document.getElementById(`topic-${course.id}-${topic}`) : null;
      if (target) { target.classList.add('target-question'); target.scrollIntoView({block: 'start', behavior: 'instant'}); target.focus({preventScroll: true}); }
      else window.scrollTo({top: 0, behavior: 'instant'});
    });
  }
  function showSource(entry, opener) {
    sourceOpener = opener;
    const {q, course: owner, category} = entry;
    $('#source-title').textContent = `${owner.title} · 第 ${q.index} 题`;
    $('#dialog-hint').textContent = owner.id === 'intercultural-english' ? '以下为已完成习题页面采集时保存的题干、选项与公布的正确答案。来源页面可能需要登录。' : '以下为保存的章节习题来源原文，可对照来源题号与原始答案。';
    const content = $('#source-content'); content.replaceChildren();
    if (q.correction) content.append(element('p', 'question-note', `站内校订答案：${q.answer}；来源原文答案：${q.correction.originalAnswer}。${q.correction.note}`));
    for (const source of q.sources) {
      const section = element('section', 'source-reference'); section.append(element('h3', '', `${source.file || categoryText(category)} · 原第 ${source.number} 题`), element('pre', 'source-raw', source.raw));
      const links = element('div', 'source-links'), upstream = element('a', '', owner.id === 'intercultural-english' ? '在学堂在线查看习题 ↗' : '在 GitHub 查看原文 ↗');
      upstream.href = source.url; upstream.target = '_blank'; upstream.rel = 'noopener noreferrer'; links.append(upstream);
      if (source.file) { const download = element('a', '', '下载本章原始题库 ↓'); download.href = `sources/${encodeURIComponent(source.file)}`; download.download = source.file; links.append(download); }
      section.append(links); content.append(section);
    }
    dialog.showModal(); dialog.scrollTop = 0; document.body.style.overflow = 'hidden';
  }
  function reset() { search.value = ''; state.type = 'all'; filterQuestions(); }
  function focusSearch() { $('#search-area').scrollIntoView({block: 'start'}); search.focus({preventScroll: true}); }
  search.addEventListener('input', filterQuestions);
  $('#type-filters').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (button) { state.type = button.dataset.type; filterQuestions(); } });
  $('#answer-toggle').addEventListener('click', () => { state.answersHidden = !state.answersHidden; state.answerOverrides.clear(); filterQuestions(); });
  $('#reset-filters').addEventListener('click', () => { reset(); search.focus(); });
  $('#print-button').addEventListener('click', () => window.print());
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const entry = byKey.get(button.dataset.key); if (!entry) return;
    if (button.dataset.action === 'source') showSource(entry, button);
    else { const hidden = !nodes.get(entry.key).answer.hidden; state.answerOverrides.set(entry.key, hidden); setAnswer(entry, hidden); }
  });
  $('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; if (sourceOpener?.isConnected) sourceOpener.focus({preventScroll: true}); });
  dialog.addEventListener('click', event => { const bounds = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close(); });
  $('#course-switch').addEventListener('change', event => { location.hash = href(event.target.value); });
  $('#topic-nav').addEventListener('click', event => {
    const link = event.target.closest('a[data-topic]'); if (!link) return;
    event.preventDefault(); reset(); history.replaceState(null, '', link.href);
    topicLinks.forEach(node => { const active = node === link; node.classList.toggle('active', active); if (active) node.setAttribute('aria-current', 'location'); else node.removeAttribute('aria-current'); });
    $('#all-questions').classList.remove('active'); document.getElementById(`topic-${course.id}-${link.dataset.topic}`).scrollIntoView({block: 'start'});
  });
  $('#all-questions').addEventListener('click', event => { event.preventDefault(); reset(); history.replaceState(null, '', href(course.id)); topicLinks.forEach(link => { link.classList.remove('active'); link.removeAttribute('aria-current'); }); event.currentTarget.classList.add('active'); list.scrollIntoView({block: 'start'}); });
  for (const id of ['header-search', 'hero-search']) $(`#${id}`).addEventListener('click', focusSearch);
  $('#browse-courses').addEventListener('click', event => { event.preventDefault(); $('#course-picker').scrollIntoView({block: 'start'}); });
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); list.scrollIntoView({block: 'start'}); list.focus({preventScroll: true}); });
  $('#back-top').addEventListener('click', () => window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
  document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !dialog.open && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); focusSearch(); } });
  window.addEventListener('hashchange', renderRoute);
  renderCourses(); renderRoute();
})();
