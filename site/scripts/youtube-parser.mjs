const BOOKS = [
  ['창세기', '창', 50], ['출애굽기', '출', 40], ['레위기', '레', 27],
  ['민수기', '민', 36], ['신명기', '신', 34], ['여호수아', '수', 24],
  ['사사기', '삿', 21], ['룻기', '룻', 4], ['사무엘상', '삼상', 31],
  ['사무엘하', '삼하', 24], ['열왕기상', '왕상', 22], ['열왕기하', '왕하', 25],
  ['역대상', '대상', 29], ['역대하', '대하', 36], ['에스라', '스', 10],
  ['느헤미야', '느', 13], ['에스더', '에', 10], ['욥기', '욥', 42],
  ['시편', '시', 150], ['잠언', '잠', 31], ['전도서', '전', 12],
  ['아가', '아', 8], ['이사야', '사', 66], ['예레미야', '렘', 52],
  ['예레미야애가', '애', 5], ['에스겔', '겔', 48], ['다니엘', '단', 12],
  ['호세아', '호', 14], ['요엘', '욜', 3], ['아모스', '암', 9],
  ['오바댜', '옵', 1], ['요나', '욘', 4], ['미가', '미', 7],
  ['나훔', '나', 3], ['하박국', '합', 3], ['스바냐', '습', 3],
  ['학개', '학', 2], ['스가랴', '슥', 14], ['말라기', '말', 4],
  ['마태복음', '마', 28], ['마가복음', '막', 16], ['누가복음', '눅', 24],
  ['요한복음', '요', 21], ['사도행전', '행', 28], ['로마서', '롬', 16],
  ['고린도전서', '고전', 16], ['고린도후서', '고후', 13], ['갈라디아서', '갈', 6],
  ['에베소서', '엡', 6], ['빌립보서', '빌', 4], ['골로새서', '골', 4],
  ['데살로니가전서', '살전', 5], ['데살로니가후서', '살후', 3],
  ['디모데전서', '딤전', 6], ['디모데후서', '딤후', 4], ['디도서', '딛', 3],
  ['빌레몬서', '몬', 1], ['히브리서', '히', 13], ['야고보서', '약', 5],
  ['베드로전서', '벧전', 5], ['베드로후서', '벧후', 3],
  ['요한일서', '요일', 5], ['요한이서', '요이', 1], ['요한삼서', '요삼', 1],
  ['유다서', '유', 1], ['요한계시록', '계', 22],
];

const BOOK_BY_ALIAS = new Map();
for (const [name, short, maxChapter] of BOOKS) {
  BOOK_BY_ALIAS.set(name, { name, short, maxChapter });
  BOOK_BY_ALIAS.set(short, { name, short, maxChapter });
}

// 공식 채널 설명에 반복해서 쓰인 표기를 정식 성경명으로 정규화한다.
BOOK_BY_ALIAS.set('빌립소서', BOOK_BY_ALIAS.get('빌립보서'));

const BOOK_PATTERN = [...BOOK_BY_ALIAS.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

const SCRIPTURE_PATTERN = new RegExp(
  `(${BOOK_PATTERN})\\s*(\\d{1,3})\\s*[:：]\\s*(\\d{1,3})(?:\\s*[-~～〜–—]\\s*(\\d{1,3}))?`,
  'u',
);

export function decodeXml(value = '') {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  };

  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu, (_, entity) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] ?? `&${entity};`;
    });
}

export function parseYouTubeFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gu)].map((match) => {
    const entry = match[1];
    const videoId = getTagText(entry, 'yt:videoId');
    return {
      videoId,
      title: getTagText(entry, 'title'),
      description: getTagText(entry, 'media:description'),
      publishedAt: getTagText(entry, 'published'),
      updatedAt: getTagText(entry, 'updated'),
      url: getLink(entry, 'alternate') || `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: getAttribute(entry, 'media:thumbnail', 'url'),
    };
  });
}

export function classifyVideo(title, description = '') {
  const text = `${title}\n${description}`.replace(/\s+/gu, ' ').trim();

  if (/(주일|수요|금요|새벽|예배).*?(말씀|설교)|(?:말씀|설교).*?(주일|수요|금요|예배)/u.test(text)) {
    return 'sermon';
  }
  if (/새벽\s*기도회/u.test(text)) return 'dawn_prayer';
  if (/찬양대|성가대/u.test(text)) return 'choir';
  if (/교회\s*뉴스|세계선교교회\s*뉴스|주간\s*소식/u.test(text)) return 'news';
  if (/찬양팀|찬양\s*인도/u.test(text)) return 'praise';
  if (/(금요|수요).*?기도회/u.test(text)) return 'prayer_service';
  if (/(주일|수요|금요).*?예배|예배\s*(실황|전체)/u.test(text)) return 'worship_service';
  if (SCRIPTURE_PATTERN.test(description)) return 'sermon';
  return 'unknown';
}

export function parseScripture(text = '') {
  const match = text.match(SCRIPTURE_PATTERN);
  if (!match) return null;

  const [, alias, chapterText, startVerseText, endVerseText] = match;
  const book = BOOK_BY_ALIAS.get(alias);
  const chapter = Number(chapterText);
  const startVerse = Number(startVerseText);
  const endVerse = endVerseText ? Number(endVerseText) : null;
  const warnings = [];

  if (chapter < 1 || chapter > book.maxChapter) warnings.push('invalid_chapter');
  if (startVerse < 1 || startVerse > 200) warnings.push('invalid_start_verse');
  if (endVerse !== null && (endVerse < startVerse || endVerse > 200)) warnings.push('invalid_end_verse');

  const verseRange = endVerse === null ? `${startVerse}` : `${startVerse}–${endVerse}`;
  return {
    raw: match[0],
    book: book.name,
    bookShort: book.short,
    chapter,
    startVerse,
    endVerse,
    normalized: `${book.name} ${chapter}:${verseRange}`,
    short: `${book.short} ${chapter}`,
    warnings,
  };
}

export function parseVideo(video) {
  const classification = classifyVideo(video.title, video.description);
  const combined = `${video.title}\n${video.description}`;
  const date = parseDate(combined, video.publishedAt);
  const scripture = parseScripture(combined);
  const sermonTitle = extractSermonTitle(video, scripture);
  const preacher = extractPreacher(video.description);
  const warnings = [];

  if (classification === 'sermon') {
    if (!date) warnings.push('missing_date');
    if (!sermonTitle) warnings.push('missing_sermon_title');
    if (!scripture) warnings.push('missing_scripture');
    if (!preacher) warnings.push('missing_preacher');
    if (scripture?.warnings.length) warnings.push(...scripture.warnings);
  }

  return {
    classification,
    isSermon: classification === 'sermon',
    title: sermonTitle,
    date,
    scripture: scripture?.normalized ?? null,
    scriptureShort: scripture?.short ?? null,
    preacher,
    youtube: video.url,
    videoId: video.videoId,
    sourceTitle: video.title,
    sourceDescription: video.description,
    publishedAt: video.publishedAt,
    warnings: [...new Set(warnings)],
    ruleStatus: classification === 'sermon' && warnings.length === 0
      ? 'parsed'
      : classification === 'sermon' || classification === 'unknown'
        ? 'review'
        : 'ignored',
  };
}

export function resolveRuleOnlyStatus(rule) {
  if (rule.ruleStatus === 'ignored') return 'ignored';
  if (rule.ruleStatus === 'parsed') return 'approved';
  return 'review';
}

export function compareRuleAndGemini(rule, gemini) {
  const conflicts = [];
  if (rule.isSermon !== gemini.isSermon) conflicts.push('classification');

  if (rule.isSermon && gemini.isSermon) {
    compareField('date', rule.date, gemini.date, conflicts);
    compareField('scripture', rule.scripture, normalizeGeminiScripture(gemini.scripture), conflicts);
    if (normalizeComparable(rule.title) !== normalizeComparable(gemini.title)) conflicts.push('title');
  }

  if (Array.isArray(gemini.ambiguities) && gemini.ambiguities.length > 0) {
    conflicts.push('gemini_ambiguity');
  }

  return {
    conflicts,
    status: conflicts.length === 0 && rule.warnings.length === 0
      ? rule.isSermon ? 'approved' : 'ignored'
      : 'review',
  };
}

function parseDate(text, publishedAt) {
  const full = text.match(/(?:^|[^\d])(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:[^\d]|$)/u);
  if (full) return toIsoDate(Number(full[1]), Number(full[2]), Number(full[3]));

  const korean = text.match(/(?:^|[^\d])(\d{1,2})월\s*(\d{1,2})일(?:[^\d]|$)/u);
  if (!korean || !publishedAt) return null;

  const year = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric',
  }).format(new Date(publishedAt)));
  return toIsoDate(year, Number(korean[1]), Number(korean[2]));
}

function extractSermonTitle(video, scripture) {
  if (scripture) {
    for (const line of video.description.split(/\r?\n/gu).map((value) => value.trim()).filter(Boolean)) {
      const index = line.indexOf(scripture.raw);
      if (index <= 0) continue;
      const candidate = line.slice(0, index).replace(/[\s(（]+$/gu, '').trim();
      if (candidate && !/세계선교교회|주일.*말씀/u.test(candidate)) return candidate;
    }
  }

  const cleaned = video.title
    .replace(/^\s*\[?20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}\]?\s*/u, '')
    .replace(/세계선교교회/gu, '')
    .replace(/(?:주일|수요|금요)\s*\d*부?\s*(?:예배)?\s*(?:말씀|설교)/gu, '')
    .trim();

  return cleaned || null;
}

function extractPreacher(description = '') {
  for (const line of description.split(/\r?\n/gu).map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(/^(.{2,30}?)\s*목사(?:님)?$/u);
    if (match) return `${match[1].trim()} 목사`;
  }
  return null;
}

function normalizeGeminiScripture(value) {
  return parseScripture(value ?? '')?.normalized ?? value ?? null;
}

function normalizeComparable(value) {
  return (value ?? '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

function compareField(name, left, right, conflicts) {
  if ((left ?? null) !== (right ?? null)) conflicts.push(name);
}

function toIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTagText(xml, tag) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'u');
  return decodeXml(xml.match(pattern)?.[1]?.trim() ?? '');
}

function getLink(xml, rel) {
  const pattern = new RegExp(`<link\\s+[^>]*rel=["']${escapeRegExp(rel)}["'][^>]*href=["']([^"']+)["'][^>]*\\/?>(?:<\\/link>)?`, 'u');
  return decodeXml(xml.match(pattern)?.[1] ?? '');
}

function getAttribute(xml, tag, attribute) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}\\s+[^>]*${escapeRegExp(attribute)}=["']([^"']+)["'][^>]*\\/?>`, 'u');
  return decodeXml(xml.match(pattern)?.[1] ?? '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
