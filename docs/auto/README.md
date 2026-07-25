# Auto

URL·웹 검색 기반 자동 분석, 스케줄 실행, 카카오·텔레그램 결과 전송.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [overview.md](./overview.md) | 번들·스케줄·UI·저장 개요 |
| [execution-pipeline.md](./execution-pipeline.md) | executeBundle 파이프라인·취소·폴백 |
| [scheduler-persistence.md](./scheduler-persistence.md) | 스케줄 메모리 한계·재시작 영향·복원 방안 |
| [api-endpoints.md](./api-endpoints.md) | `/api/auto/*` REST API |

## 관련 코드

- `src/lib/components/auto/` — Auto UI
- `src/lib/stores/auto.svelte.ts` — 번들 상태·실행
- `src/lib/server/scheduler.ts` — 스케줄·실행 엔진
- `src/routes/api/auto/` — Auto API
