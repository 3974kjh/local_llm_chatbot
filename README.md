# JukimBot — Local LLM Chatbot

SvelteKit + Ollama/OpenRouter 기반 로컬 LLM 채팅 및 자동화(URL 분석·웹 검색·카카오/텔레그램 전송) 앱입니다.

## 기술 스택

- **Frontend**: Svelte 5 (runes), SvelteKit 2, Tailwind CSS 4
- **Backend**: SvelteKit API routes, Node
- **LLM**: Ollama (`llama3.1:8b`) 또는 OpenRouter (`openrouter/free`, OmniRoute 클라이언트)
- **웹 검색**: SearXNG → Serper → DuckDuckGo (우선순위 폴백)
- **Storage**: IndexedDB (채팅·번들·텔레그램 설정), 서버 메모리 스케줄·카카오 토큰 파일

## 주요 기능

### 1. Chat 모드

- **LLM 제공자 전환**: 사이드바에서 Local(Ollama) / OpenRouter 선택 (`llmStore`)
- 스트리밍 채팅, 5단계 진행 표시 (준비 → 수집 → 분석 → 작성 → 완료)
- 대화 목록·생성·삭제 (IndexedDB `jukimbot-chat-conversations`)
- **웹 검색** (Web 토글, 기본 on): SearXNG/Serper/DDG 검색 후 질문 깊이에 따라 3~8개 URL 본문 수집
  - 검색 결과는 소스 카드 + `raw_answer`(원문) + LLM **AI 요약**으로 표시
- **Deep Research** (Deep 토글): `/api/deep-search` 다단계 리서치 (Fast/Balanced/Deep 프리셋, 시드 URL 최대 8개)
- 마크다운 렌더링, 생성 중단(Abort), 최근 20개 메시지 컨텍스트 전송

### 2. Auto 모드

- **번들(Bundle)**: URL 목록 + 프롬프트 + 웹 검색 on/off + 텔레그램 on/off + LLM 제공자
- **스케줄**
  - **Minutes**: N분마다 실행 (30분~24시간 슬라이더)
  - **Daily**: 매일 지정 시간 (`HH:mm`)에 1회
  - **Every N days**: N일마다 지정 시간에 1회
- **Run Now**: 즉시 1회 실행, 실행 중 **Stop Run**으로 중단 가능 (fetch·전송 단계 취소)
- **실행 흐름**: URL fetch → (옵션) 웹 검색 → LLM 요약/분석 → (옵션) Kakao / Telegram 전송
- OpenRouter 실패 시 Auto는 로컬 Ollama로 자동 폴백 (Chat 스트리밍은 폴백 없음)
- URL 0개여도 웹 검색만 켜면 실행 가능
- 실행 기준 일시를 프롬프트에 포함, 동시 LLM 실행 최대 2개 제한

### 3. 텔레그램

- **설정 모달**: 봇(Bot Token) / 수신처(Chat ID) 목록 CRUD (IndexedDB)
- 번들에서 봇·수신처 콤보박스로 지정
- 테스트 전송, 청크 분할 전송 (4,000자), 전송 타임아웃 처리
- 실행 시 UI에서 선택한 봇/수신처 토큰 사용

### 4. 카카오톡

- OAuth 연동 (`KAKAO_REST_API_KEY`), 토큰은 서버 `.kakao-tokens.json`에 저장
- 연결 시 **모든** Auto 성공 실행 결과를 카카오로 전송 (번들별 설정 없음)

### 5. 데이터 저장

- **IndexedDB** (`src/lib/db/`): 채팅 대화, Auto 번들, 텔레그램 봇/채팅 목록
- **localStorage**: LLM 제공자 선택 (`jukimbot-llm-provider`)
- 기존 localStorage 데이터는 최초 로드 시 IndexedDB로 마이그레이션 후 제거

---

## 문서

기능별 상세 설명서는 `docs/`에 있습니다.

| 문서 | 설명 |
|------|------|
| [docs/README.md](./docs/README.md) | 문서 인덱스 |
| [docs/process-guide.html](./docs/process-guide.html) | 통합 HTML 프로세스 가이드 (Mermaid 포함) |
| [docs/chat/](./docs/chat/) | Chat 모드 (개요, API) |
| [docs/auto/](./docs/auto/) | Auto 모드 (개요, 실행 파이프라인, API) |
| [docs/deep-research/](./docs/deep-research/) | Deep Research (개요, 파이프라인, API) |
| [docs/llm/](./docs/llm/) | LLM 제공자 (설정, 헬스체크, 폴백) |

---

## 파일 구조

```
src/
├── lib/
│   ├── types/              # Message, Conversation, AutoBundle 등
│   ├── stores/             # app, chat, auto, llm, telegramConfigs (.svelte.ts)
│   ├── services/api.ts     # streamChat, streamDeepSearch (SSE 클라이언트)
│   ├── chatPipeline.ts     # Chat 진행 단계 라벨
│   ├── deepSearchBudget.ts # Deep Research 예산·프리셋
│   ├── db/                 # IndexedDB 래퍼
│   ├── server/
│   │   ├── llm/            # Ollama·OmniRoute 제공자, 스트림 파서
│   │   ├── deepSearch/     # Deep Research 파이프라인
│   │   ├── answerDepth.ts  # 질문 깊이 휴리스틱 (brief/standard/comprehensive)
│   │   ├── chatProgress.ts # Chat SSE progress 헬퍼
│   │   ├── search.ts       # SearXNG → Serper → DDG
│   │   ├── scraper.ts      # URL 본문 추출
│   │   ├── scheduler.ts    # Auto 실행·스케줄·취소
│   │   ├── kakao.ts, telegram.ts, promptLocale.ts, ...
│   │   └── ollama.ts       # llm/ 재export shim
│   └── components/
│       ├── ChatLayout, ChatInput, MessageBubble, ChatProgressStepper, ...
│       ├── DeepSearchProgress, RawAnswerBlock, ...
│       └── auto/           # AutoLayout, BundleEditor, TelegramSettingsModal
└── routes/
    ├── +page.svelte        # Chat / Auto 분기
    └── api/
        ├── chat/           # POST 스트리밍 채팅
        ├── deep-search/    # POST Deep Research SSE
        ├── llm/health/     # GET LLM 제공자 헬스체크
        └── auto/           # execute, schedule, status, kakao, telegram
```

---

## 설정

### 환경 변수

`.env.example`을 복사해 `.env`를 만듭니다.

| 변수 | 설명 |
|------|------|
| `OLLAMA_URL` | Ollama API (기본 `http://localhost:11434`) |
| `OLLAMA_MODEL` | 로컬 모델 (기본 `llama3.1:8b`) |
| `OMNIROUTE_BASE_URL` | OpenRouter API (기본 `https://openrouter.ai/api/v1`) |
| `OMNIROUTE_MODEL` | OpenRouter 모델 (기본 `openrouter/free`) |
| `OMNIROUTE_API_KEY` | OpenRouter API 키 |
| `LLM_DEFAULT_PROVIDER` | Auto 스케줄 기본 제공자 (`local` \| `omniroute`) |
| `SEARXNG_URL` | SearXNG 인스턴스 (선택, 최우선 검색) |
| `SERPER_API_KEY` | Serper.dev API 키 (선택) |
| `KAKAO_REST_API_KEY` | 카카오 OAuth (카카오 연동 시) |

### 실행

```bash
npm install
npm run dev
```

- **Local** 제공자 사용 시 Ollama가 로컬에서 실행 중이어야 합니다.
- **OpenRouter** 사용 시 `OMNIROUTE_API_KEY`가 필요합니다.
- 웹 검색 품질 향상을 위해 SearXNG 또는 Serper 설정을 권장합니다.

---

## API 요약

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/chat` | POST | 스트리밍 채팅 (SSE: progress, sources, token, done) |
| `/api/deep-search` | POST | Deep Research 스트리밍 |
| `/api/llm/health` | GET | LLM 제공자 연결 확인 (`?provider=local\|omniroute`) |
| `/api/auto/execute` | POST | Run Now |
| `/api/auto/execute/cancel` | POST | Run Now 취소 (`bundleId`) |
| `/api/auto/schedule` | POST | 스케줄 start / stop / stop-all |
| `/api/auto/status` | GET | 스케줄된 번들 상태 |
| `/api/auto/telegram/test` | POST | 텔레그램 테스트 전송 |
| `/api/auto/kakao/connect` | GET | 카카오 OAuth 시작 |

---

## 빌드·테스트

```bash
npm run build
npm run preview
npm run check    # svelte-check
npm run lint     # prettier + eslint
npm run test     # playwright e2e
```
