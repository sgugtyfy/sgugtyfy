# 学研题库

按课程整理的静态复习网站。目前收录 **2 门课程、675 道题**：

| 课程 | 题目 | 章节练习 |
| --- | ---: | ---: |
| 信息检索与科技写作 | 475 | 12 |
| 跨文化交际英语（2026秋） | 200 | 40（10 个单元） |

首页显示课程卡片，并能搜索所有课程的题干、选项、答案和章节。点击课程后，一次性显示这门课的全部题目，不分页、不无限滚动。支持章节跳转、题型筛选、逐题或整体隐藏答案、来源原文核对、打印及手机浏览。搜索结果可以直接定位到对应课程中的具体题目。

## 查看与部署

直接打开 `index.html` 即可使用，无需安装依赖，也可以通过任意静态服务器查看。

沿用 Northflank 部署：根目录 Dockerfile 使用 `nginx:alpine`，HTTP 端口 **80**。自行提交并推送到原来绑定的 GitHub 分支，Northflank 自动构建即可更新网站；无需删除或新建 GitHub 仓库。

## 文件与修改答案

- `questions.js`：信息检索与科技写作的网页数据。
- `english-questions.js`：跨文化交际英语的网页数据。
- `courses.js`：首页课程名称、介绍和题库关联。
- `sources/`：原课程的 12 份 TXT 及来源清单。
- `data/intercultural-english.json`：英语课程的正式题库，仅保留题目、正确答案和来源，不包含采集续传记录或账号资料。
- `answer-overrides.json`：原课程的手动答案校订，已经保留 `chapter-6-q7` 的答案 `6000`。来源原文仍保留 `8000`，网页来源弹窗会说明这项差异。

**永久改原课程答案**：在 `answer-overrides.json` 按题目 ID 修改或添加 `answer`，然后运行 `node scripts/import-bank.mjs`。

**永久改英语答案**：修改 `data/intercultural-english.json` 中对应题目的 `answer`；若是填空，同时修改 `blanks`。然后运行 `node scripts/import-english.mjs`。

直接修改两个网页数据 JS 也会立即影响页面，但下次重新生成时会覆盖，因此建议修改上述正式来源文件。

## 来源与整理原则

信息检索与科技写作来自 [Oldmemory1 的课程习题仓库](https://github.com/Oldmemory1/BIT-Information-Retrieval-and-Scientific-Writing)，原始文件哈希与准确行号保留在项目中。`9.4习题.txt` 的第 46 条误标为第 56 题，保留独立记录并注明原题号问题。

英语课程来自用户提供的学堂在线已完成习题导出，覆盖全部 40 节、200 题：单选 72 题、判断 111 题、填空 17 题。只收录页面公布的正确答案，保留每空答案、可接受写法及习题来源链接；网页导航中的图标字体已去除，题干与选项不改写。

多选题答案按原文顺序显示字母，如 `EADBC`，不使用箭头。只有题型、题干、选项及答案一致时才合并；本次两门课没有需要合并的重复记录。

## 网站维护检查

```powershell
node scripts/import-bank.mjs
node scripts/import-english.mjs
node scripts/verify.mjs
node --check app.js
```

这三个维护脚本均与网站题库生成、来源校验有关；采集脚本和临时测试文件不再放在项目中。站点完全在浏览器本地搜索和阅读，不需要登录、数据库或外部题库服务。
