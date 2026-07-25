# JukimBot 문서

SvelteKit + Ollama 기반 로컬 LLM 채팅·자동화 앱의 기능 설명서입니다.

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

## 문서 구조

```text
docs/
├── process-guide.html   # 통합 HTML 가이드
├── chat/                # Chat 모드
│   ├── overview.md
│   └── api-endpoints.md
└── auto/                # Auto 모드
    ├── overview.md
    ├── execution-pipeline.md
    └── api-endpoints.md
```

## 문서 작성 규칙

- 상세 문서: `docs/{feature}/{detail-topic}.md`
- 폴더·파일명: 영문 kebab-case
- 본문: 한국어
