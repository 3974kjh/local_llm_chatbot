# Chat

Ollama·OmniRoute 기반 스트리밍 채팅, 웹 검색 연동, IndexedDB 대화 저장.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [overview.md](./overview.md) | Chat 모드 UI·흐름·저장·LLM 제공자 |
| [api-endpoints.md](./api-endpoints.md) | `/api/chat` SSE API·이벤트 타입 |

## 관련 코드

- `src/lib/components/ChatLayout.svelte` — Chat 화면 레이아웃
- `src/lib/stores/chat.svelte.ts` — 대화 상태·전송
- `src/routes/api/chat/+server.ts` — Chat API
