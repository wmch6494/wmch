# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-17
- Primary product surfaces: 풀페이지 랜딩(`/`), 말씀 아카이브(`/sermons/`)
- Evidence reviewed: `HANDOFF.md` §4, `design-concepts/concept-d-landing.html`, `site/src/pages/`, `site/src/styles/global.css`

## Brand
- Personality: 담백하고 직접적이며, 말씀과 실제 교회 정보를 중심에 둔다.
- Trust signals: 실제 설교 제목·본문·날짜, 확인된 예배 시간·주소·연락처, 실제 공간 이미지
- Avoid: 감성 마케팅 카피, 가짜 통계·폼, eyebrow+제목+설명 구조의 반복, 미국 교회 문구 직역, AI 티

## Product goals
- Goals: 방문자가 최신 말씀, 예배 시간, 위치를 빠르게 확인한다.
- Non-goals: 로그인, 댓글, 커뮤니티, 방문 예약 플로우
- Success signals: 최신 설교가 첫 화면에 정확히 노출되고 핵심 링크가 즉시 작동한다.

## Personas and jobs
- Primary personas: 기존 교인, 예배를 찾는 지역 방문자, 유튜브 설교 시청자
- User jobs: 이번 주 설교 시청, 예배 시간 확인, 교회 위치·연락처 확인
- Key contexts of use: 주일 전후 모바일, 유튜브 시청 중 데스크톱

## Information architecture
- Primary navigation: 말씀, 예배 안내, 오시는 길
- Core routes/screens: 풀페이지 랜딩, 말씀 전체 목록
- Content hierarchy: 히어로 → 최신 말씀 → 비전 → 예배 → 사역 → 오시는 길

## Design principles
- 랜딩 문법: 풀스크린 포토 히어와 패널 단위 스크롤을 유지한다.
- 말씀 우선: 히어로와 내비게이션의 주요 CTA는 최신 말씀으로 향한다.
- 최신 말씀 중복 노출: 가장 최신 설교는 왼쪽 대표 카드와 오른쪽 목록 첫 항목에 모두 표시한다.
- 열어 두기: 문장 폭은 불필요한 2행과 마지막 한두 단어의 고립을 피하되 작은 화면에서는 자연스런 줄바꿈을 허용한다.
- Tradeoffs: 화려한 정보량보다 핵심 정보의 즉시성과 독해성을 우선한다.

## Visual language
- Color: 딸그린·차콜의 어두운 패널과 업화이트 패퍼 배경
- Typography: Apple SD Gothic Neo 우선 시스템 스택, 짧고 단단한 제목, `balance`/`pretty` 줄바꿈
- Spacing/layout rhythm: 1200px 최대 폭, 28px 가로 여백, 패널 단위의 넓은 수직 여백
- Shape/radius/elevation: 카드에만 20–24px 라운딩, 절제된 그림자
- Motion: 패널 진입 reveal과 키네틱 타이포, `prefers-reduced-motion` 필수
- Imagery/iconography: 실제 본당 사진과 현재 승인된 사역 이미지만 사용

## Components
- Existing components to reuse: `Base.astro`, 히어로, 설교 특집 카드, 설교 목록, 예배 테이블, 사역 카드, Google Maps 임베드
- New/changed components: 없음. 기존 CSS 선택자를 확장한다.
- Variants and states: hover, focus-visible, reduced-motion, mobile single-column
- Token/component ownership: 전역 토큰과 컴포넌트 스타일은 `site/src/styles/global.css`

## Accessibility
- Target standard: 주요 키보드 탐색과 WCAG AA 대비를 유지한다.
- Keyboard/focus behavior: 모든 주요 링크와 페이지 도트에 명확한 focus-visible 표시
- Contrast/readability: 어두운 사진 위 오버레이와 고대비 텍스트 유지
- Screen-reader semantics: 장식 이미지는 빈 `alt`, 이동 도트는 섹션 이름을 포함한 label 제공
- Reduced motion and sensory considerations: 모든 전환·순차 모션은 reduced-motion에서 즉시 표시

## Responsive behavior
- Supported breakpoints/devices: 640px, 720px, 880px 기준의 모바일·태블릿·데스크톱
- Layout adaptations: 880px 이하에서 풀페이지 스냅을 풀고 그리드를 1열로 전환
- Mobile navigation: 720px 이하에서는 상단 바를 고정하지 않고 문서와 함께 스크롤해 본문을 가리지 않는다.
- Touch/hover differences: hover는 보조 효과로만 사용하고 핵심 정보를 숨기지 않는다.

## Interaction states
- Loading: 정적 페이지로 별도 로딩 UI 없음
- Empty: 설교 콜렉션은 배포 전 최소 1편을 보장한다.
- Error: 외부 영상은 새 탭에서 열고 현재 페이지를 유지한다.
- Success: 링크는 즉시 목표 섹션·유튜브로 이동한다.
- Disabled: 현재 해당 상태 없음
- Offline/slow network: 외부 폰트를 사용하지 않고 핵심 정보는 HTML에 포함한다.

## Content voice
- Tone: 담백하고 구체적인 한국어
- Terminology: “말씀”, “예배 안내”, “오시는 길”을 일관되게 사용
- Microcopy rules: 시스템 동작을 설명하는 문장보다 실제 정보를 보여 준다. 확인되지 않은 문구를 지어내지 않는다.

## Implementation constraints
- Framework/styling system: Astro, 전역 CSS, Content Collections
- Design-token constraints: 기존 `:root` 토큰을 재사용하고 새 디자인 레이어를 만들지 않는다.
- Performance constraints: 외부 폰트·불필요한 JS·새 의존성을 추가하지 않고, Google Maps iframe은 지연 로딩한다.
- Compatibility constraints: GitHub Pages 커스텀 도메인, `base` 경로 없음
- Test/screenshot expectations: `cd site && npx astro build`, 주요 화면 크기에서 스크린샷 검사

## Open questions
- [ ] 실제 사역 사진을 수급하면 현재 사역 카드 이미지를 대체할지 운영자가 결정한다.
