import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 설교 한 편 = Markdown 파일 하나. 파일을 추가하면 사이트에 자동 반영됩니다.
const sermons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sermons' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    scripture: z.string(),          // 예: "이사야 43:14–21"
    scriptureShort: z.string(),     // 예: "사 43:14–21"
    preacher: z.string().default('담임목사'),
    youtube: z.string().url().optional(), // 유튜브 영상 링크
  }),
});

const notices = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notices' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = { sermons, notices };
