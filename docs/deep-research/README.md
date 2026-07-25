# Deep Research

다단계 웹 리서치, 주장 검증, gap-fill 검색, 최종 합성.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [overview.md](./overview.md) | UI·프리셋·시드 URL·사용법 |
| [pipeline.md](./pipeline.md) | 서버 파이프라인 단계별 상세 |
| [api-endpoints.md](./api-endpoints.md) | `/api/deep-search` SSE API |

## 관련 코드

- `src/lib/server/deepSearch/` — 리서치 파이프라인 모듈
- `src/lib/deepSearchBudget.ts` — 프리셋 예산
- `src/routes/api/deep-search/+server.ts` — API 핸들러
