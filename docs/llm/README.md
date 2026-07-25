# LLM

Ollama·OpenRouter(OmniRoute) 이중 제공자, 헬스체크, 기능별 폴백.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [providers.md](./providers.md) | 제공자 설정, env, 스트림 종류, Facade API |
| [health-and-fallback.md](./health-and-fallback.md) | 헬스체크 API, Auto 폴백, 기능별 동작 |

## 관련 코드

- `src/lib/server/llm/` — LLM 제공자 모듈
- `src/routes/api/llm/health/+server.ts` — 헬스 API
- `src/lib/stores/llm.svelte.ts` — 클라이언트 제공자 선택
