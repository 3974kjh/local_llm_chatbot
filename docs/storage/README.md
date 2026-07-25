# 데이터 저장소

클라이언트 IndexedDB·localStorage와 서버 파일 기반 영구 저장.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [indexeddb-keys-migration.md](./indexeddb-keys-migration.md) | IndexedDB 스키마·저장 키·localStorage 마이그레이션 |
| [server-file-storage.md](./server-file-storage.md) | 카카오 OAuth 토큰 파일 (`.kakao-tokens.json`) |

## 관련 코드

- `src/lib/db/` — IndexedDB 연결·KV API
- `src/lib/stores/chat.svelte.ts` — 채팅 대화 저장
- `src/lib/stores/auto.svelte.ts` — Auto 번들 저장
- `src/lib/stores/telegramConfigs.svelte.ts` — 텔레그램 설정 저장
- `src/lib/stores/llm.svelte.ts` — LLM 제공자 (localStorage)
- `src/lib/server/kakao.ts` — 서버 토큰 파일 I/O
