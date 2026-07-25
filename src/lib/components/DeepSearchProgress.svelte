<script lang="ts">
	import { DEEP_SEARCH_BUDGET } from '$lib/deepSearchBudget';
	import type { ClaimStatus, DeepSearchStep } from '$lib/types';
	import { slide } from 'svelte/transition';

	let { steps, isStreaming }: { steps: DeepSearchStep[]; isStreaming: boolean } = $props();

	let manualOverride = $state<boolean | null>(null);
	const expanded = $derived(manualOverride !== null ? manualOverride : false);

	function toggle() {
		manualOverride = !expanded;
	}

	const roundCount = $derived(steps.filter((s) => s.type === 'refine_start').length);

	const maxRoundsDisplay = $derived(
		[...steps].reverse().find((s) => s.type === 'refine_start')?.maxRounds ??
			DEEP_SEARCH_BUDGET.refineRounds
	);

	const lastVerify = $derived([...steps].reverse().find((s) => s.type === 'verify'));

	const completeStep = $derived(steps.find((s) => s.type === 'complete'));

	const evidenceWarning = $derived(steps.find((s) => s.type === 'evidence_warning'));

	const presetLabel = $derived.by(() => {
		const p = steps.find((s) => s.type === 'start')?.preset;
		if (p === 'fast') return 'Fast';
		if (p === 'deep') return 'Deep';
		if (p === 'balanced') return 'Balanced';
		return null;
	});

	const totalSources = $derived(
		steps
			.filter((s) => s.type === 'sources')
			.reduce((acc, s) => acc + (s.sourceResults?.length ?? 0), 0)
	);

	const totalPagesFetched = $derived(
		completeStep?.totalPagesFetched ??
			steps
				.filter((s) => s.type === 'web_search')
				.reduce((acc, s) => acc + (s.pagesFetched ?? 0), 0)
	);

	const summaryLine = $derived(
		[
			roundCount > 0 ? `검증 ${roundCount}/${maxRoundsDisplay}` : null,
			lastVerify?.confidence != null
				? `${Math.round(lastVerify.confidence * 100)}% 신뢰도`
				: null,
			totalSources > 0 ? `${totalSources}개 출처` : null,
			totalPagesFetched > 0 ? `${totalPagesFetched}페이지` : null,
			evidenceWarning ? '출처 없음' : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	function confidenceColor(c: number): string {
		if (c >= 0.75) return 'text-teal-400';
		if (c >= 0.5) return 'text-amber-400';
		return 'text-red-400';
	}

	function confidenceBarWidth(c: number): string {
		return `${Math.round(c * 100)}%`;
	}

	function claimStatusLabel(status: ClaimStatus): string {
		switch (status) {
			case 'supported':
				return '지원됨';
			case 'unsupported':
				return '미지원';
			case 'contradicted':
				return '모순';
			case 'unverifiable':
				return '확인 불가';
		}
	}

	function claimStatusColor(status: ClaimStatus): string {
		switch (status) {
			case 'supported':
				return 'text-teal-400';
			case 'unsupported':
				return 'text-amber-400';
			case 'contradicted':
				return 'text-red-400';
			case 'unverifiable':
				return 'text-slate-500';
		}
	}
</script>

<div
	class="mb-3 w-full min-w-0 max-w-full overflow-x-hidden rounded-xl border border-chat-border bg-chat-raised"
>
	<button
		onclick={toggle}
		class="flex w-full min-w-0 max-w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-chat-surface"
	>
		<div class="flex min-w-0 shrink items-center gap-2">
			<svg
				class="h-4 w-4 flex-shrink-0 text-violet-400"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M6 18h8" />
				<path d="M3 22h18" />
				<path d="M14 22a7 7 0 1 0 0-14h-1" />
				<path d="M9 14h2" />
				<path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
				<path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
			</svg>
			<span class="text-sm font-medium text-slate-300">Deep Research</span>
			{#if isStreaming}
				<span class="flex items-center gap-1">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400"></span>
					<span
						class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]"
					></span>
					<span
						class="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:300ms]"
					></span>
				</span>
			{/if}
		</div>

		<div class="ml-6 flex min-w-0 flex-shrink-0 items-center gap-3">
			{#if !expanded && summaryLine}
				<span class="max-w-[55vw] truncate text-right text-xs text-slate-500 sm:max-w-md">
					{summaryLine}
				</span>
			{/if}
			<svg
				class="h-4 w-4 text-slate-500 transition-transform duration-200 {expanded
					? 'rotate-180'
					: ''}"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</div>
	</button>

	{#if expanded}
		<div
			transition:slide={{ duration: 200 }}
			class="min-w-0 max-w-full overflow-x-hidden px-4 pb-4 pt-1"
		>
			<div class="relative flex min-w-0 max-w-full flex-col gap-0">
				<div
					class="absolute bottom-3 left-3.5 top-3 w-px bg-gradient-to-b from-violet-500/40 via-chat-border to-teal-500/20"
				></div>

				{#each steps as step, i (i)}
					<div class="relative flex min-w-0 max-w-full gap-3 py-2">
						<div
							class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border {step.type ===
							'evidence_warning'
								? 'border-amber-500/30 bg-amber-500/15'
								: step.type === 'verify'
									? 'border-amber-500/30 bg-amber-500/15'
									: step.type === 'refine'
										? 'border-indigo-500/30 bg-indigo-500/15'
										: step.type === 'complete'
											? 'border-teal-500/30 bg-teal-500/15'
											: 'border-violet-500/30 bg-violet-500/15'}"
						>
							<span class="text-[10px] font-bold text-violet-300">
								{step.type === 'refine_start' ? (step.round ?? '?') : '·'}
							</span>
						</div>

						<div
							class="min-w-0 max-w-full flex-1 overflow-hidden break-words pt-0.5 [overflow-wrap:anywhere]"
						>
							{#if step.type === 'start'}
								<p class="mb-1 text-xs font-semibold text-violet-300">검증-반복 모드 시작</p>
								{#if presetLabel}
									<p class="text-[10px] text-slate-500">
										Depth: <span class="text-violet-300">{presetLabel}</span>
										{#if step.message}
											· {step.message}
										{/if}
									</p>
								{/if}
							{:else if step.type === 'evidence_warning'}
								<div class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
									<p class="text-[11px] font-medium text-amber-300">외부 출처 없음</p>
									<p class="mt-0.5 text-[11px] text-amber-200/80">{step.message}</p>
								</div>
							{:else if step.type === 'plan'}
								<p class="mb-1 text-xs font-semibold text-violet-300">연구 계획</p>
								{#if step.strategy}
									<p class="mb-2 text-[11px] leading-relaxed text-slate-400">{step.strategy}</p>
								{/if}
								{#if step.subQueries && step.subQueries.length > 0}
									<p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
										검색 쿼리
									</p>
									<ul class="flex flex-col gap-0.5">
										{#each step.subQueries as q (q)}
											<li class="text-[11px] text-slate-400">• {q}</li>
										{/each}
									</ul>
								{/if}
							{:else if step.type === 'searching'}
								<p class="text-xs font-semibold text-sky-300">웹 검색 중</p>
								{#if step.query}
									<p class="mt-0.5 text-[11px] text-slate-400">{step.query}</p>
								{/if}
							{:else if step.type === 'web_search'}
								<p class="mb-1 text-xs font-semibold text-sky-300">
									갭 웹 검색 (라운드 {step.round ?? '?'})
								</p>
								{#if step.queries && step.queries.length > 0}
									<ul class="mb-1 flex flex-col gap-0.5">
										{#each step.queries as q (q)}
											<li class="text-[11px] text-slate-400">• {q}</li>
										{/each}
									</ul>
								{/if}
								{#if step.pagesFetched != null}
									<p class="text-[10px] text-slate-500">{step.pagesFetched}페이지 수집</p>
								{/if}
							{:else if step.type === 'draft'}
								<p class="mb-1 text-xs font-semibold text-violet-300">초안 생성</p>
								{#if step.content}
									<p class="text-[11px] leading-relaxed text-slate-500">{step.content}…</p>
								{/if}
							{:else if step.type === 'refine_start'}
								<p class="text-xs font-semibold text-indigo-300">
									검증 라운드 {step.round ?? '?'}/{step.maxRounds ??
										DEEP_SEARCH_BUDGET.refineRounds}
								</p>
							{:else if step.type === 'decompose'}
								<p class="mb-1 text-xs font-semibold text-violet-300">하위 질문 · 주장 분해</p>
								{#if step.subQuestions && step.subQuestions.length > 0}
									<ul class="mb-2 flex flex-col gap-0.5">
										{#each step.subQuestions as q (q)}
											<li class="text-[11px] text-slate-400">• {q}</li>
										{/each}
									</ul>
								{/if}
								{#if step.claims && step.claims.length > 0}
									<p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
										{step.claims.length}개 주장
									</p>
								{/if}
							{:else if step.type === 'verify'}
								{#if step.confidence != null}
									<div class="mb-2 flex items-center gap-2">
										<div class="h-1.5 flex-1 rounded-full bg-chat-border">
											<div
												class="h-full rounded-full transition-all {step.confidence >= 0.75
													? 'bg-teal-400'
													: step.confidence >= 0.5
														? 'bg-amber-400'
														: 'bg-red-400'}"
												style="width: {confidenceBarWidth(step.confidence)}"
											></div>
										</div>
										<span
											class="flex-shrink-0 text-[11px] font-semibold {confidenceColor(
												step.confidence
											)}"
										>
											{Math.round(step.confidence * 100)}%
										</span>
									</div>
								{/if}
								<p class="mb-1 text-xs font-semibold text-amber-300">주장 검증</p>
								{#if step.claimResults && step.claimResults.length > 0}
									<div class="flex flex-col gap-1">
										{#each step.claimResults as v (v.claim)}
											<div class="flex items-start gap-1.5 text-[11px]">
												<span class="flex-shrink-0 {claimStatusColor(v.status)}">
													[{claimStatusLabel(v.status)}]
												</span>
												<span class="text-slate-400">{v.claim}</span>
											</div>
										{/each}
									</div>
								{/if}
							{:else if step.type === 'refine'}
								<p class="mb-1 text-xs font-semibold text-indigo-300">답변 수정</p>
								{#if step.thought}
									<p class="mb-1 text-[11px] leading-relaxed text-slate-400">{step.thought}</p>
								{/if}
							{:else if step.type === 'sources'}
								<div class="flex min-w-0 flex-wrap items-center gap-1.5">
									<span
										class="text-xs font-medium {step.isUserProvided
											? 'text-amber-300'
											: 'text-teal-300'}"
									>
										{step.sourceResults?.length ?? 0}개
										{step.isUserProvided ? '첨부 출처 (우선)' : '웹 검색 출처'}
									</span>
									{#if step.query && !step.isUserProvided}
										<span class="text-[10px] text-slate-500">· {step.query}</span>
									{/if}
								</div>
								{#if step.sourceResults && step.sourceResults.length > 0}
									<ul class="mt-2 flex min-w-0 max-w-full flex-col gap-1.5">
										{#each step.sourceResults as r (r.url)}
											<li class="min-w-0 max-w-full">
												<a
													href={r.url}
													target="_blank"
													rel="noopener noreferrer"
													class="block max-w-full rounded-lg border border-chat-border bg-chat-surface/60 px-2.5 py-2 transition-colors hover:border-teal-500/35 hover:bg-chat-surface"
												>
													<p
														class="text-xs font-medium text-teal-300 break-words [overflow-wrap:anywhere]"
													>
														{r.title}
													</p>
													<p
														class="mt-0.5 break-all text-[10px] text-slate-500 [overflow-wrap:anywhere]"
													>
														{r.url}
													</p>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{:else if step.type === 'complete'}
								<div class="rounded-lg border border-teal-500/20 bg-teal-500/5 px-2.5 py-2">
									<div class="flex items-center justify-between gap-2">
										<p class="text-[11px] font-semibold text-teal-300">검증 완료</p>
										{#if step.confidence != null}
											<span
												class="text-[11px] font-bold {confidenceColor(step.confidence)}"
											>
												{Math.round(step.confidence * 100)}% 신뢰도
											</span>
										{/if}
									</div>
									{#if step.stopReason}
										<p
											class="mt-0.5 break-words text-[10px] text-slate-500 [overflow-wrap:anywhere]"
										>
											{step.stopReason}
										</p>
									{/if}
									{#if step.totalPagesFetched != null && step.totalPagesFetched > 0}
										<p class="mt-0.5 text-[10px] text-slate-500">
											총 {step.totalPagesFetched}페이지 수집
										</p>
									{/if}
								</div>
							{:else if step.type === 'synthesis_start'}
								<p class="text-xs font-semibold text-indigo-300">최종 답변 출력</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
