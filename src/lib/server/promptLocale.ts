/**
 * Shared instructions for user-facing LLM outputs: Korean + web-grounded facts.
 * Import these into chat, deep search, scheduler, etc. to avoid prompt drift.
 */

/** User-visible body must be Korean; quotes/URLs/proper nouns may stay as in source. */
export const RESPONSE_LANGUAGE_KO = `언어(필수): 사용자에게 보이는 모든 본문은 한국어로만 작성한다. URL·고유명사·원문 인용·코드·표에 나온 숫자는 원문 그대로 둘 수 있다. 영어로 답하지 않는다.`;

/**
 * Facts must come from provided web/scraped/research text only.
 * Training weights are "legacy" for factual claims.
 */
export const WEB_FIRST_GROUNDING = `근거 우선(필수): 사실·수치·날짜·정의·최신 사건은 반드시 아래에 제공된 웹 검색·페이지 본문·연구 수집 텍스트에 등장할 때만 서술한다. 자료에 없으면 "제공된 자료에서는 확인되지 않았다"고 한국어로 명시한다. 학습 데이터(모델 사전 지식)는 최신 사실의 근거로 사용하지 않는다. 학습 지식은 문장 연결·용어 설명 등, 제공 자료의 의미를 바꾸지 않는 범위로만 허용한다.`;

/** When web search is off or empty: honest fallback, still Korean. */
export const CHAT_NO_SEARCH_KO = `웹 검색 결과가 이 요청에 포함되지 않았다. 답변은 학습 시점의 지식에 의존할 수 있어 최신 정보와 다를 수 있다. 한국어로 답하고, 최신 수치·뉴스가 중요한 주제면 사용자에게 웹 검색을 켜 달라고 안내한다.`;
