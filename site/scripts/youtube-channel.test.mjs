import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchYouTubeVideos,
  parseInvidiousVideo,
  parseYouTubeChannelPage,
  parseYouTubeClientConfig,
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
const channelPage = () => [
  '<script>ytcfg.set({"INNERTUBE_API_KEY":"public-key","INNERTUBE_CLIENT_VERSION":"2.20260918.00.00","VISITOR_DATA":"visitor-data"});</script>',
  page('ytInitialData', channelData),
].join('');

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

test('채널 페이지에서 플레이어 API 설정을 읽는다', () => {
  assert.deepEqual(parseYouTubeClientConfig(channelPage()), {
    apiKey: 'public-key',
    clientVersion: '2.20260918.00.00',
    visitorData: 'visitor-data',
  });
});

test('보조 메타데이터는 공식 영상 ID와 채널 ID가 모두 일치할 때만 사용한다', () => {
  const fallback = {
    videoId: 'sermon123',
    title: '공식 채널 제목',
    publishedAt: '',
    url: 'https://www.youtube.com/watch?v=sermon123',
    thumbnail: 'official.jpg',
  };
  const payload = {
    videoId: 'sermon123',
    authorId: 'channel123',
    title: '[2026.09.13] 세계선교교회 주일 2부 말씀',
    description: '그리스도의 비밀을 가진 자(골2:1~23)',
    published: 1789272000,
    videoThumbnails: [{ url: 'mirror-small.jpg', width: 120 }, { url: 'mirror-large.jpg', width: 1280 }],
  };

  const video = parseInvidiousVideo(payload, fallback, 'channel123');

  assert.equal(video.videoId, 'sermon123');
  assert.match(video.description, /골2:1~23/u);
  assert.equal(video.thumbnail, 'mirror-large.jpg');
  assert.throws(
    () => parseInvidiousVideo({ ...payload, videoId: 'other' }, fallback, 'channel123'),
    /영상 ID/u,
  );
  assert.throws(
    () => parseInvidiousVideo({ ...payload, authorId: 'other' }, fallback, 'channel123'),
    /채널 ID/u,
  );
});

test('RSS가 실패하면 공식 채널 페이지와 설교 상세 페이지로 전환한다', async () => {
  const warnings = [];
  const requested = [];
  const playerClients = [];
  let channelRequests = 0;
  const request = async (url, _label, options = {}) => {
    requested.push(url);
    if (url.includes('/feeds/')) throw new Error('YouTube RSS 요청 실패: 404');
    if (url.includes('/channel/')) {
      channelRequests += 1;
      return { text: async () => channelRequests === 1 ? '<html>일시적인 불완전 응답</html>' : channelPage() };
    }
    if (url.includes('/youtubei/v1/player')) {
      playerClients.push(JSON.parse(options.init.body).context.client.clientName);
      return { json: async () => watchData };
    }
    throw new Error(`예상하지 못한 요청: ${url}`);
  };

  const result = await fetchYouTubeVideos('channel123', {
    request,
    onWarning: (message) => warnings.push(message),
  });

  assert.equal(result.source, 'channel-page');
  assert.equal(result.videos.length, 2);
  assert.match(result.videos[0].description, /골2:1~23/u);
  assert.equal(requested.filter((url) => url.includes('/youtubei/v1/player')).length, 1);
  assert.deepEqual(playerClients, ['ANDROID']);
  assert.equal(channelRequests, 2);
  assert.match(warnings[0], /공식 채널 페이지로 전환/u);
  assert.match(warnings[1], /다시 요청/u);
});

test('GitHub 러너에서 YouTube 상세 정보가 차단되면 검증된 보조 API로 전환한다', async () => {
  const requested = [];
  const request = async (url) => {
    requested.push(url);
    if (url.includes('/feeds/')) throw new Error('YouTube RSS 요청 실패: 404');
    if (url.includes('/channel/')) return { text: async () => channelPage() };
    if (url.includes('/youtubei/v1/player')) {
      return {
        json: async () => ({
          playabilityStatus: { status: 'LOGIN_REQUIRED', reason: '로그인하여 봇이 아님을 확인하세요.' },
        }),
      };
    }
    if (url.startsWith('https://www.youtube.com/watch')
      || url.startsWith('https://m.youtube.com/watch')
      || url.startsWith('https://www.youtube.com/shorts/')) {
      throw new Error('YouTube 영상 페이지 요청 실패: 429');
    }
    if (url.startsWith('https://api.invidious.io/')) {
      return {
        json: async () => [[
          'mirror.test',
          { api: true, type: 'https', uri: 'https://mirror.test', monitor: { down: false } },
        ]],
      };
    }
    if (url.startsWith('https://mirror.test/api/v1/videos/')) {
      return {
        json: async () => ({
          videoId: 'sermon123',
          authorId: 'channel123',
          title: '[2026.09.13] 세계선교교회 주일 2부 말씀',
          description: '[2026.09.13] 세계선교교회 주일 2부 말씀\n그리스도의 비밀을 가진 자(골2:1~23)\n이창섭 목사님',
          published: 1789272000,
          videoThumbnails: [{ url: 'mirror.jpg', width: 1280 }],
        }),
      };
    }
    throw new Error(`예상하지 못한 요청: ${url}`);
  };

  const result = await fetchYouTubeVideos('channel123', { request, onWarning: () => {} });

  assert.equal(result.source, 'channel-page');
  assert.match(result.videos[0].description, /그리스도의 비밀/u);
  assert.ok(requested.some((url) => url.startsWith('https://mirror.test/api/v1/videos/')));
});
