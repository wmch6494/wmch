// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages(프로젝트 페이지) 배포 설정.
// 커스텀 도메인(wmch.or.kr) 연결 시 site를 도메인으로 바꾸고 base를 제거하면 됩니다.
export default defineConfig({
  site: 'https://wmch6494.github.io',
  base: '/wmch',
});
