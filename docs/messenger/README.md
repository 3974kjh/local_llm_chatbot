# 메신저 연동

Auto 분석 결과를 카카오톡·텔레그램으로 전송하는 연동.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [kakao-oauth.md](./kakao-oauth.md) | 카카오 OAuth·토큰·나에게 보내기 API |
| [telegram-bot-api.md](./telegram-bot-api.md) | Telegram Bot API·청크 전송·번들 연동 |

## 관련 코드

- `src/lib/server/kakao.ts` — 카카오 OAuth·메시지
- `src/lib/server/telegram.ts` — 텔레그램 Bot API
- `src/routes/api/auto/kakao/` — 카카오 REST API
- `src/routes/api/auto/telegram/` — 텔레그램 REST API
- `src/lib/server/scheduler.ts` — 실행 후 메신저 전송
- `src/lib/stores/telegramConfigs.svelte.ts` — 텔레그램 봇·채팅 설정
