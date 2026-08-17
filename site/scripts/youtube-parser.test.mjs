import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyVideo,
  parseScripture,
  parseVideo,
  parseYouTubeFeed,
  resolveRuleOnlyStatus,
} from './youtube-parser.mjs';

test('실제 설교 설명에서 제목, 본문, 설교자를 추출한다', () => {
  const result = parseVideo({
    videoId: 'Kb8TU6WI0yM',
    title: '[2026.07.12] 세계선교교회 주일 2부 말씀',
    description: '[2026.07.12] 세계선교교회 주일 2부 말씀\n사탄의 싸움 기술(에베소서6:1~13)\n이창섭 목사님',
    publishedAt: '2026-07-12T03:27:52+00:00',
    url: 'https://www.youtube.com/watch?v=Kb8TU6WI0yM',
  });

  assert.equal(result.classification, 'sermon');
  assert.equal(result.date, '2026-07-12');
  assert.equal(result.title, '사탄의 싸움 기술');
  assert.equal(result.scripture, '에베소서 6:1–13');
  assert.equal(result.scriptureShort, '엡 6');
  assert.equal(result.preacher, '이창섭 목사');
  assert.deepEqual(result.warnings, []);
  assert.equal(resolveRuleOnlyStatus(result), 'approved');
});

test('정보가 빠진 설교는 자동 게시하지 않고 검수 대상으로 남긴다', () => {
  const result = parseVideo({
    videoId: 'needs-review',
    title: '[2026.08.16] 세계선교교회 주일 2부 말씀',
    description: '',
    publishedAt: '2026-08-16T03:00:00+00:00',
    url: 'https://www.youtube.com/watch?v=needs-review',
  });

  assert.equal(result.ruleStatus, 'review');
  assert.equal(resolveRuleOnlyStatus(result), 'review');
});

test('예배 전체와 새벽기도회, 찬양대, 뉴스를 구분한다', () => {
  assert.equal(classifyVideo('2026.7.12 세계선교교회 주일3부 예배'), 'worship_service');
  assert.equal(classifyVideo('7월14일 새벽기도회'), 'dawn_prayer');
  assert.equal(classifyVideo('2026.7.10 세계선교교회 금요기도회'), 'prayer_service');
  assert.equal(classifyVideo('[2026.07.12] 세계선교교회 오직예수찬양대'), 'choir');
  assert.equal(classifyVideo('[2026.07.12] 세계선교교회 뉴스'), 'news');
});

test('성경 약칭도 정규화하고 잘못된 장을 경고한다', () => {
  assert.equal(parseScripture('엡 6:1-13').normalized, '에베소서 6:1–13');
  assert.equal(parseScripture('빌립소서2:1~30').normalized, '빌립보서 2:1–30');
  assert.deepEqual(parseScripture('에베소서 7:1').warnings, ['invalid_chapter']);
});

test('YouTube Atom 피드를 영상 객체로 변환한다', () => {
  const videos = parseYouTubeFeed(`
    <feed xmlns:yt="x" xmlns:media="y">
      <entry>
        <yt:videoId>abc123</yt:videoId>
        <title>제목 &amp; 부제</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
        <published>2026-07-12T00:00:00Z</published>
        <updated>2026-07-12T01:00:00Z</updated>
        <media:group><media:description>본문</media:description><media:thumbnail url="thumb.jpg"/></media:group>
      </entry>
    </feed>
  `);

  assert.equal(videos.length, 1);
  assert.equal(videos[0].title, '제목 & 부제');
  assert.equal(videos[0].description, '본문');
  assert.equal(videos[0].thumbnail, 'thumb.jpg');
});
