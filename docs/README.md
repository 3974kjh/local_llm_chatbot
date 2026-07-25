# JukimBot 문서

SvelteKit + Ollama/OpenRouter 기반 로컬 LLM 채팅·자동화 앱의 기능 설명서입니다.

## HTML 프로세스 가이드

전체 기능을 Mermaid 도식과 함께 한 페이지에서 볼 수 있습니다.

| 문서 | 설명 |
|------|------|
| [process-guide.html](./process-guide.html) | 통합 프로세스 가이드 (HTML) |

## 기능별 문서

| 기능 | 설명 | 바로가기 |
|------|------|---------|
| Chat | 스트리밍 채팅, 웹 검색, LLM 제공자 전환 | [chat/](./chat/) |
| Auto | 번들 자동 분석, 스케줄, 메신저 전송 | [auto/](./auto/) |
| Deep Research | 다단계 웹 리서치, 주장 검증, 합성 | [deep-research/](./deep-research/) |
| LLM | Ollama·OpenRouter 제공자, 헬스체크, 폴백 | [llm/](./llm/) |
| Storage | IndexedDB·localStorage·서버 파일 저장 | [storage/](./storage/) |
| Messenger | 카카오 OAuth·텔레그램 Bot API | [messenger/](./messenger/) |

## 문서 구조

```text
docs/
├── process-guide.html
├── chat/
│   ├── overview.md
│   └── api-endpoints.md
├── auto/
│   ├── overview.md
│   ├── execution-pipeline.md
│   └── api-endpoints.md
├── deep-research/
│   ├── overview.md
│   ├── pipeline.md
│   └── api-endpoints.md
├── llm/
│   ├── providers.md
│   └── health-and-fallback.md
├── storage/
│   ├── indexeddb-keys-migration.md
│   └── server-file-storage.md
└── messenger/
    ├── kakao-oauth.md
    └── telegram-bot-api.md
```

## 문서 작성 규칙

- 상세 문서: `docs/{feature}/{detail-topic}.md`
- 폴더·파일명: 영문 kebab-case
- 본문: 한국어
