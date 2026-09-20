import { fetchWithRetry } from './fetch-with-retry.mjs';
import { classifyVideo, parseYouTubeFeed } from './youtube-parser.mjs';

const WEB_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

const defaultRequest = (url, label, options = {}) => {
  const { init = {}, ...retry } = options;
  const { headers = {}, ...requestInit } = init;
  return fetchWithRetry(url, {
    ...requestInit,
    headers: { ...WEB_HEADERS, ...headers },
  }, {
    label,
    attempts: 3,
    baseDelayMs: 2_000,
    timeoutMs: 20_000,
    ...retry,
  });
};

export async function fetchYouTubeVideos(channelId, options = {}) {
  const {
    limit = 15,
    request = defaultRequest,
    onWarning = (message) => console.warn(message),
  } = options;
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  try {
    const response = await request(feedUrl, 'YouTube RSS 요청', {
      attempts: 2,
      baseDelayMs: 1_000,
    });
    const videos = parseYouTubeFeed(await response.text());
    if (videos.length === 0) throw new Error('YouTube RSS에 영상이 없습니다.');
    return { source: 'rss', feedUrl, videos };
  } catch (error) {
    onWarning(`YouTube RSS를 사용할 수 없어 공식 채널 페이지로 전환합니다. (${error.message})`);
  }

  const videos = await fetchYouTubeChannelVideos(channelId, {
    limit,
    request,
    onWarning,
  });
  return { source: 'channel-page', feedUrl, videos };
}

export async function fetchYouTubeChannelVideos(channelId, options = {}) {
  const {
    limit = 15,
    request = defaultRequest,
    onWarning = (message) => console.warn(message),
  } = options;
  const channelUrl = `https://www.youtube.com/channel/${channelId}/videos?hl=ko&gl=KR`;
  const { summaries, client } = await fetchChannelPageData(channelUrl, limit, request, onWarning);

  const videos = [];
  for (const summary of summaries) {
    const classification = classifyVideo(summary.title);
    if (classification !== 'sermon' && classification !== 'unknown') {
      videos.push(summary);
      continue;
    }

    try {
      videos.push(await fetchYouTubeVideoDetails(summary, client, request));
    } catch (error) {
      if (classification === 'sermon') throw error;
      onWarning(`영상 상세 정보를 읽지 못해 검수 대상으로 남깁니다: ${summary.videoId} (${error.message})`);
      videos.push(summary);
    }
  }

  return videos;
}

async function fetchChannelPageData(channelUrl, limit, request, onWarning) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const separator = channelUrl.includes('?') ? '&' : '?';
    const response = await request(
      `${channelUrl}${separator}wmch_attempt=${attempt}`,
      `YouTube 채널 페이지 요청 (${attempt}/3)`,
    );
    const channelHtml = await response.text();

    try {
      const summaries = parseYouTubeChannelPage(channelHtml).slice(0, limit);
      if (summaries.length === 0) {
        throw new Error('YouTube 채널 페이지에서 영상 목록을 찾지 못했습니다.');
      }

      const client = parseYouTubeClientConfig(channelHtml);
      if (!client) throw new Error('YouTube 채널 페이지에서 플레이어 설정을 찾지 못했습니다.');
      return { summaries, client };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        onWarning(`YouTube 채널 페이지 응답을 해석하지 못해 다시 요청합니다. (${error.message})`);
      }
    }
  }

  throw lastError;
}

export function parseYouTubeChannelPage(html) {
  const data = extractJsonPayload(html, [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
    'ytInitialData = ',
  ]);
  const videos = [];
  collectVideoSummaries(data, videos);
  return [...new Map(videos.map((video) => [video.videoId, video])).values()];
}

export function parseYouTubeWatchPage(html, fallback = {}) {
  const player = extractJsonPayload(html, [
    'var ytInitialPlayerResponse = ',
    'window["ytInitialPlayerResponse"] = ',
    'ytInitialPlayerResponse = ',
  ]);
  return parseYouTubePlayerResponse(player, fallback);
}

export function parseYouTubeClientConfig(html) {
  const readConfig = (key) => {
    const match = html.match(new RegExp(`"${key}":"((?:\\\\.|[^"\\\\])*)"`, 'u'));
    return match ? JSON.parse(`"${match[1]}"`) : '';
  };
  const apiKey = readConfig('INNERTUBE_API_KEY');
  const clientVersion = readConfig('INNERTUBE_CLIENT_VERSION');
  if (!apiKey || !clientVersion) return null;

  return {
    apiKey,
    clientVersion,
    visitorData: readConfig('VISITOR_DATA'),
  };
}

export function parseYouTubePlayerResponse(player, fallback = {}) {
  const details = player.videoDetails;
  if (!details?.videoId) {
    const status = player.playabilityStatus?.status;
    const reason = player.playabilityStatus?.reason;
    const context = [status, reason].filter(Boolean).join(': ');
    throw new Error(`YouTube 영상 페이지에서 상세 정보를 찾지 못했습니다.${context ? ` (${context})` : ''}`);
  }

  const microformat = player.microformat?.playerMicroformatRenderer ?? {};
  const thumbnails = details.thumbnail?.thumbnails ?? [];
  return {
    videoId: details.videoId,
    title: details.title || fallback.title || '',
    description: details.shortDescription || '',
    publishedAt: microformat.publishDate || microformat.uploadDate || '',
    updatedAt: '',
    url: `https://www.youtube.com/watch?v=${details.videoId}`,
    thumbnail: pickLargestThumbnail(thumbnails)?.url || fallback.thumbnail || '',
  };
}

async function fetchYouTubeVideoDetails(summary, client, request) {
  const playerErrors = [];

  if (client) {
    for (const profile of playerProfiles(client)) {
      try {
        const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(client.apiKey)}&prettyPrint=false`;
        const response = await request(endpoint, `YouTube ${profile.name} 플레이어 정보 요청 (${summary.videoId})`, {
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'user-agent': profile.userAgent,
              'x-youtube-client-name': profile.id,
              'x-youtube-client-version': profile.version,
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: profile.name,
                  clientVersion: profile.version,
                  hl: 'ko',
                  gl: 'KR',
                  ...profile.context,
                },
              },
              videoId: summary.videoId,
              contentCheckOk: true,
              racyCheckOk: true,
            }),
          },
        });
        return parseYouTubePlayerResponse(await response.json(), summary);
      } catch (error) {
        playerErrors.push(`${profile.name}: ${error.message}`);
      }
    }
  }

  try {
    const response = await request(summary.url, `YouTube 영상 페이지 요청 (${summary.videoId})`);
    return parseYouTubeWatchPage(await response.text(), summary);
  } catch (error) {
    const causes = [...playerErrors, `WATCH: ${error.message}`].join(' / ');
    throw new Error(`YouTube 영상 상세 정보를 읽지 못했습니다: ${summary.videoId} (${causes})`);
  }
}

function playerProfiles(client) {
  return [{
    name: 'ANDROID',
    id: '3',
    version: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip',
    context: { androidSdkVersion: 35 },
  }, {
    name: 'IOS',
    id: '5',
    version: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)',
    context: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.1.22D72',
    },
  }, {
    name: 'WEB',
    id: '1',
    version: client.clientVersion,
    userAgent: WEB_HEADERS['user-agent'],
    context: { visitorData: client.visitorData },
  }];
}

function collectVideoSummaries(value, videos) {
  if (!value || typeof value !== 'object') return;

  if (value.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && value.contentId) {
    const metadata = value.metadata?.lockupMetadataViewModel;
    const title = metadata?.title?.content;
    if (title) {
      videos.push(toVideoSummary(
        value.contentId,
        title,
        value.contentImage?.thumbnailViewModel?.image?.sources,
      ));
    }
  }

  if (value.videoId && value.title && value.thumbnail) {
    const title = readText(value.title);
    if (title) videos.push(toVideoSummary(value.videoId, title, value.thumbnail.thumbnails));
  }

  for (const nested of Object.values(value)) collectVideoSummaries(nested, videos);
}

function toVideoSummary(videoId, title, thumbnails = []) {
  return {
    videoId,
    title,
    description: '',
    publishedAt: '',
    updatedAt: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: pickLargestThumbnail(thumbnails)?.url || '',
  };
}

function extractJsonPayload(html, markers) {
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) continue;

    const start = html.indexOf('{', markerIndex + marker.length);
    if (start < 0) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) {
        return JSON.parse(html.slice(start, index + 1));
      }
    }
  }

  throw new Error('YouTube 페이지의 초기 JSON 데이터를 찾지 못했습니다.');
}

function readText(value) {
  if (typeof value?.simpleText === 'string') return value.simpleText;
  if (typeof value?.content === 'string') return value.content;
  if (Array.isArray(value?.runs)) return value.runs.map((run) => run.text ?? '').join('');
  return '';
}

function pickLargestThumbnail(thumbnails = []) {
  return thumbnails.reduce((largest, thumbnail) => {
    if (!largest) return thumbnail;
    return (thumbnail.width ?? 0) > (largest.width ?? 0) ? thumbnail : largest;
  }, null);
}
