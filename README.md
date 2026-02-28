# JukimBot — Local LLM Chatbot

SvelteKit + Ollama 기반 로컬 LLM 채팅 및 자동화(URL 분석·웹 검색·카카오/텔레그램 전송) 앱입니다.

## 기술 스택

- **Frontend**: Svelte 5 (runes), SvelteKit 2, Tailwind CSS 4
- **Backend**: SvelteKit API routes, Node
- **LLM**: Ollama (llama3.1:8b)
- **Storage**: IndexedDB (번들·채팅·텔레그램 설정), 서버는 메모리 스케줄

## 주요 기능

### 1. Chat 모드

- Ollama 로컬 LLM과 스트리밍 채팅
- 대화 목록·생성·삭제 (IndexedDB)
- 웹 검색 옵션: 프롬프트 기반 DuckDuckGo 검색 후 상위 3개 URL 본문 수집·첨부
- 마크다운 렌더링, 소스 카드 표시

### 2. Auto 모드

- **번들(Bundle)**: URL 목록 + 프롬프트 + 웹 검색 on/off + 텔레그램 on/off
- **스케줄**
  - **Minutes**: N분마다 실행 (30분~24시간 슬라이더)
  - **Daily**: 매일 지정 시간( HH:mm )에 1회
  - **Every N days**: N일마다 지정 시간에 1회
- **Run Now**: 즉시 1회 실행, 실행 중 **Stop Run**으로 중단 가능 (서버 취소 API로 Kakao/Telegram 전송 방지)
- **실행 흐름**: URL fetch → (옵션) 웹 검색 → Ollama 요약/분석 → (옵션) Kakao / Telegram 전송
- URL 0개여도 웹 검색만 켜면 실행 가능
- 실행 기준 일시를 프롬프트에 포함 (날씨·날짜 등 “오늘” 기준 응답)
- 프롬프트 유형에 맞춰 응답: 단순 질문은 짧게, 기사/URL 요약은 인용·정리

### 3. 텔레그램

- **설정 모달**: 봇(Bot Token) 목록 / 수신처(Chat ID) 목록 각각 추가·편집·삭제 (IndexedDB)
- 번들에서 **봇 선택** + **수신처 선택** 콤보박스로 지정
- 테스트 전송, 청크 분할 전송, 전송 타임아웃 처리
- .env 폴백 없음: UI에서 선택한 봇/수신처만 사용

### 4. 카카오톡

- OAuth 연동 (REST API Key), 토큰 저장
- Auto 실행 결과 전송 (연동 시)

### 5. 데이터 저장

- **IndexedDB** (`src/lib/db/`): 채팅 대화, Auto 번들, 텔레그램 봇/채팅 목록
- 기존 localStorage 데이터는 최초 로드 시 자동 마이그레이션 후 제거

---

## 파일 구조

```
src/
├── app.d.ts
├── lib/
│   ├── index.ts
│   ├── types/
│   │   ├── index.ts      # Message, Conversation, SearchResult, StreamEvent
│   │   └── auto.ts       # AutoBundle, ScheduleType, TelegramBot/ChatConfig 등
│   ├── utils/
│   │   └── helpers.ts    # generateId, getCurrentDateContext
│   ├── services/
│   │   └── api.ts        # streamChat (Ollama + 검색 연동)
│   ├── db/               # IndexedDB 래퍼
│   │   ├── constants.ts
│   │   ├── openDb.ts
│   │   ├── indexedDb.ts  # getItem, setItem, removeItem
│   │   └── index.ts
│   ├── stores/           # Svelte 5 $state 스토어 (.svelte.ts)
│   │   ├── app.svelte.ts       # mode: 'chat' | 'auto'
│   │   ├── chat.svelte.ts      # 대화 목록, 활성 대화, 전송
│   │   ├── auto.svelte.ts      # 번들 CRUD, Run Now/스케줄, Kakao/Telegram 테스트
│   │   └── telegramConfigs.svelte.ts  # 봇/채팅 목록
│   ├── server/
│   │   ├── ollama.ts
│   │   ├── scraper.ts    # fetchUrlContent, fetchMultipleUrls (HTML/JSON 추출)
│   │   ├── search.ts     # searchWeb (DuckDuckGo), formatSearchContext
│   │   ├── scheduler.ts  # executeBundle, startSchedule, stopSchedule, Run 취소
│   │   ├── telegram.ts   # sendMessage, sendMessageChunked
│   │   └── kakao.ts      # 카카오 메시지 전송
│   └── components/
│       ├── ChatLayout.svelte, ChatInput.svelte, MessageList.svelte, MessageBubble.svelte
│       ├── Sidebar.svelte, BotAvatar.svelte, ModeToggle.svelte
│       ├── MarkdownRenderer.svelte, SourceCard.svelte, ThinkingIndicator.svelte
│       └── auto/
│           ├── AutoLayout.svelte        # 번들 목록 + 에디터/빈 화면
│           ├── BundleEditor.svelte     # 번들 폼, Run Now/Stop, 스케줄 on/off
│           └── TelegramSettingsModal.svelte
├── routes/
│   ├── +layout.svelte
│   ├── +page.svelte      # Chat / Auto 분기
│   ├── layout.css        # 전역·Tailwind
│   └── api/
│       ├── chat/+server.ts             # POST: 스트리밍 채팅
│       └── auto/
│           ├── execute/+server.ts      # POST: Run Now (body에 bundleId)
│           ├── execute/cancel/+server.ts  # POST: Run 취소 (body에 bundleId)
│           ├── schedule/+server.ts     # POST: start/stop/stop-all
│           ├── status/+server.ts       # GET: 스케줄 상태
│           ├── telegram/
│           │   ├── test/+server.ts
│           │   └── status/+server.ts
│           └── kakao/
│               ├── connect/+server.ts
│               ├── callback/+server.ts
│               ├── status/+server.ts
│               └── test/+server.ts
```

---

## 설정

### 환경 변수 (선택)

- `.env.example` 참고. Kakao/Telegram 실제 값은 UI에서 설정 가능.
- `KAKAO_REST_API_KEY`: 카카오 개발자 앱 REST API 키 (카카오 연동 시)
- Ollama 기본: `http://localhost:11434`, 모델 `llama3.1:8b` (scheduler/ollama에서 변경 가능)

### 실행

```bash
npm install
npm run dev
```

Ollama가 로컬에서 실행 중이어야 Chat/Auto 실행이 동작합니다.

---

## API 요약

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/chat` | POST | 스트리밍 채팅 (Ollama + 검색) |
| `/api/auto/execute` | POST | Run Now (body: bundleId, title, autoApplyText, ...) |
| `/api/auto/execute/cancel` | POST | Run Now 취소 (body: bundleId) |
| `/api/auto/schedule` | POST | start / stop / stop-all (스케줄) |
| `/api/auto/status` | GET | 스케줄된 번들 상태 |
| `/api/auto/telegram/test` | POST | 텔레그램 테스트 전송 |
| `/api/auto/kakao/connect` | GET | 카카오 OAuth 시작 |

---

## 빌드·테스트

```bash
npm run build
npm run preview
npm run check    # svelte-check
npm run lint    # prettier + eslint
npm run test    # playwright e2e
```
