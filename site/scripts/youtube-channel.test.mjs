import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchYouTubeVideos,
  parseYouTubeChannelPage,
  parseYouTubeWatchPage,
} from './youtube-channel.mjs';

const channelData = {
  contents: [{
    richItemRenderer: {
      content: {
        lockupViewModel: {
          contentId: 'sermon123',
          contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
          contentImage: {
            thumbnailViewModel: {
              image: { sources: [{ url: 'small.jpg', width: 120 }, { url: 'large.jpg', width: 720 }] },
            },
          },
          metadata: {
            lockupMetadataViewModel: {
              title: { content: '[2026.09.13] 세계선교교회 주일 2부 말씀' },
            },
          },
        },
      },
    },
  }, {
    videoRenderer: {
      videoId: 'news123',
      title: { runs: [{ text: '[2026.09.13] 세계선교교회 뉴스' }] },
      thumbnail: { thumbnails: [{ url: 'news.jpg', width: 320 }] },
    },
  }],
};

const watchData = {
  videoDetails: {
    videoId: 'sermon123',
    title: '[2026.09.13] 세계선교교회 주일 2부 말씀',
    shortDescription: '[2026.09.13] 세계선교교회 주일 2부 말씀\n그리스도의 비밀을 가진 자(골2:1~23)\n이창섭 목사님',
    thumbnail: { thumbnails: [{ url: 'watch-small.jpg', width: 120 }, { url: 'watch-large.jpg', width: 1280 }] },
  },
  microformat: {
    playerMicroformatRenderer: { publishDate: '2026-09-12T20:28:44-07:00' },
  },
};

const page = (name, data) => `<script>var ${name} = ${JSON.stringify(data)};</script>`;

test('공식 채널 페이지의 현재·이전 영상 구조를 모두 읽는다', () => {
  const videos = parseYouTubeChannelPage(page('ytInitialData', channelData));

  assert.equal(videos.length, 2);
  assert.deepEqual(videos[0], {
    videoId: 'sermon123',
    title: '[2026.09.13] 세계선교교회 주일 2부 말씀',
    description: '',
    publishedAt: '',
    updatedAt: '',
    url: 'https://www.youtube.com/watch?v=sermon123',
    thumbnail: 'large.jpg',
  });
  assert.equal(videos[1].videoId, 'news123');
});

test('영상 페이지에서 설교 설명과 게시일을 읽는다', () => {
  const video = parseYouTubeWatchPage(page('ytInitialPlayerResponse', watchData));

  assert.equal(video.videoId, 'sermon123');
  assert.match(video.description, /그리스도의 비밀을 가진 자/u);
  assert.equal(video.publishedAt, '2026-09-12T20:28:44-07:00');
  assert.equal(video.thumbnail, 'watch-large.jpg');
});

test('RSS가 실패하면 공식 채널 페이지와 설교 상세 페이지로 전환한다', async () => {
  const warnings = [];
  const requested = [];
  const request = async (url) => {
    requested.push(url);
    if (url.includes('/feeds/')) throw new Error('YouTube RSS 요청 실패: 404');
    if (url.includes('/channel/')) return { text: async () => page('ytInitialData', channelData) };
    if (url.includes('sermon123')) return { text: async () => page('ytInitialPlayerResponse', watchData) };
    throw new Error(`예상하지 못한 요청: ${url}`);
  };

  const result = await fetchYouTubeVideos('channel123', {
    request,
    onWarning: (message) => warnings.push(message),
  });

  assert.equal(result.source, 'channel-page');
  assert.equal(result.videos.length, 2);
  assert.match(result.videos[0].description, /골2:1~23/u);
  assert.equal(requested.filter((url) => url.includes('/watch?')).length, 1);
  assert.match(warnings[0], /공식 채널 페이지로 전환/u);
});
