<script lang="ts">
	import { DEEP_SEARCH_BUDGET } from '$lib/deepSearchBudget';
	import type { DeepSearchStep } from '$lib/types';
	import { slide } from 'svelte/transition';

	let { steps, isStreaming }: { steps: DeepSearchStep[]; isStreaming: boolean } = $props();

	let manualOverride = $state<boolean | null>(null);
	const expanded = $derived(manualOverride !== null ? manualOverride : isStreaming);

	function toggle() {
		manualOverride = !expanded;
	}

	const totalSources = $derived(
		steps
			.filter((s) => s.type === 'sources')
			.reduce((acc, s) => acc + (s.results?.length ?? 0), 0)
	);

	const roundCount = $derived(steps.filter((s) => s.type === 'iteration_start').length);

	const maxRoundsDisplay = $derived(
		[...steps].reverse().find((s) => s.type === 'iteration_start')?.maxIterations ??
			DEEP_SEARCH_BUDGET.maxRounds
	);

	const lastEval = $derived(
		[...steps].reverse().find((s) => s.type === 'evaluation')
	);

	const completeStep = $derived(steps.find((s) => s.type === 'complete'));

	const latestUrlCount = $derived(
		(() => {
			const last = [...steps].reverse().find((s) => s.type === 'iteration_start');
			return last?.totalUrlsFetched ?? 0;
		})()
	);

	const summaryLine = $derived(
		[
			roundCount > 0 ? `Round ${roundCount}/${maxRoundsDisplay}` : null,
			latestUrlCount > 0 ? `${latestUrlCount} pages fetched` : null,
			lastEval?.confidence != null
				? `${Math.round(lastEval.confidence * 100)}% confidence`
				: null,
			totalSources > 0 ? `${totalSources} sources` : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	function confidenceColor(c: number): string {
		if (c >= DEEP_SEARCH_BUDGET.confidenceThreshold) return 'text-teal-400';
		if (c >= 0.6) return 'text-amber-400';
		return 'text-red-400';
	}

	function confidenceBarWidth(c: number): string {
		return `${Math.round(c * 100)}%`;
	}
</script>

<div
	class="mb-3 w-full min-w-0 max-w-full overflow-x-hidden rounded-xl border border-chat-border bg-chat-raised"
>
	<!-- Header / toggle -->
	<button
		onclick={toggle}
		class="flex w-full min-w-0 max-w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-chat-surface"
	>
		<div class="flex min-w-0 shrink items-center gap-2">
			<!-- Microscope icon -->
			<svg
				class="h-4 w-4 text-violet-400 flex-shrink-0"
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
					<span class="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse"></span>
					<span class="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:150ms]"
					></span>
					<span class="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:300ms]"
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
			<!-- Chevron -->
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

	<!-- Expanded steps -->
	{#if expanded}
		<div
			transition:slide={{ duration: 200 }}
			class="min-w-0 max-w-full overflow-x-hidden px-4 pb-4 pt-1"
		>
			<div class="relative flex min-w-0 max-w-full flex-col gap-0">
				<!-- Vertical timeline line -->
				<div
					class="absolute top-3 bottom-3 left-3.5 w-px bg-gradient-to-b from-violet-500/40 via-chat-border to-teal-500/20"
				></div>

				{#each steps as step, i (i)}
					<div class="relative flex min-w-0 max-w-full gap-3 py-2">
						<!-- Step dot -->
						{#if step.type === 'plan'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/15 border border-violet-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-violet-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="5" y="2" width="14" height="20" rx="2" />
									<path d="M9 7h6M9 11h6M9 15h4" />
								</svg>
							</div>
						{:else if step.type === 'iteration_start'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15 border border-indigo-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-indigo-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
									<path d="M21 3v5h-5" />
								</svg>
							</div>
						{:else if step.type === 'searching'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15 border border-teal-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-teal-400 {isStreaming ? 'animate-spin' : ''}"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<circle cx="11" cy="11" r="8" />
									<path d="m21 21-4.3-4.3" />
								</svg>
							</div>
						{:else if step.type === 'sources'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15 border border-teal-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-teal-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
									<polyline points="14 2 14 8 20 8" />
								</svg>
							</div>
						{:else if step.type === 'evaluation'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-amber-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<circle cx="12" cy="12" r="10" />
									<path d="M12 16v-4M12 8h.01" />
								</svg>
							</div>
						{:else if step.type === 'complete'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15 border border-teal-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-teal-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M20 6L9 17l-5-5" />
								</svg>
							</div>
						{:else if step.type === 'synthesis_start'}
							<div
								class="z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15 border border-indigo-500/30"
							>
								<svg
									class="h-3.5 w-3.5 text-indigo-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polygon
										points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
									/>
								</svg>
							</div>
						{/if}

						<!-- Step content -->
						<div class="min-w-0 max-w-full flex-1 overflow-hidden pt-0.5 break-words [overflow-wrap:anywhere]">
							{#if step.type === 'plan'}
								<p class="mb-1 text-xs font-semibold text-violet-300">Research plan</p>
								{#if step.strategy}
									<p class="mb-2 text-xs text-slate-400">{step.strategy}</p>
								{/if}
								{#if step.subQueries && step.subQueries.length > 0}
									<div class="mb-2 flex flex-wrap gap-1.5">
										{#each step.subQueries as q (q)}
											<span
												class="max-w-full rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] leading-snug text-violet-300 break-words [overflow-wrap:anywhere]"
											>{q}</span>
										{/each}
									</div>
								{/if}
								{#if step.stopCriteria && step.stopCriteria.length > 0}
									<div class="mt-1.5 rounded-lg border border-chat-border bg-chat-surface/50 px-2.5 py-2">
										<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Completion checklist</p>
										<ul class="flex flex-col gap-0.5">
											{#each step.stopCriteria as c (c)}
												<li class="flex items-start gap-1.5 text-[11px] text-slate-400">
													<span class="mt-0.5 flex-shrink-0 text-slate-600">○</span>
													<span class="break-words [overflow-wrap:anywhere]">{c}</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							{:else if step.type === 'iteration_start'}
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-xs font-semibold text-indigo-300">
										Round {step.iteration ?? '?'}/{step.maxIterations ?? DEEP_SEARCH_BUDGET.maxRounds}
									</p>
									{#if step.totalUrlsFetched != null}
										<span class="text-[10px] text-slate-500">{step.totalUrlsFetched} pages fetched</span>
									{/if}
								</div>
							{:else if step.type === 'searching'}
								<div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
									<span class="flex-shrink-0 text-xs text-slate-400">Searching:</span>
									<span class="text-xs font-medium text-teal-300 break-all [overflow-wrap:anywhere]">
										"{step.query}"
									</span>
								</div>
							{:else if step.type === 'sources'}
								<div class="flex min-w-0 flex-wrap items-center gap-1.5">
									<span
										class="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal-300"
									>
										<span
											class="inline-flex h-4 min-w-4 items-center justify-center rounded bg-teal-500/15 px-1 text-[10px] font-bold text-teal-300"
										>{step.results?.length ?? 0}</span>
										source{(step.results?.length ?? 0) !== 1 ? 's' : ''} found
									</span>
									{#if step.query}
										<span class="min-w-0 text-xs text-slate-500 break-words">
											for "{step.query}"
										</span>
									{/if}
								</div>
								{#if step.results && step.results.length > 0}
									<ul class="mt-2 flex min-w-0 max-w-full flex-col gap-1.5">
										{#each step.results as r (r.url)}
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
													<p class="mt-0.5 break-all text-[10px] text-slate-500 [overflow-wrap:anywhere]">
														{r.url}
													</p>
													{#if r.snippet}
														<p
															class="mt-1 text-[11px] leading-snug text-slate-400 break-words [overflow-wrap:anywhere]"
														>
															{r.snippet}
														</p>
													{/if}
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{:else if step.type === 'evaluation'}
								{#if step.confidence != null}
									<div class="mb-2 flex items-center gap-2">
										<div class="h-1.5 flex-1 rounded-full bg-chat-border">
											<div
												class="h-full rounded-full transition-all {step.confidence >= 0.85
													? 'bg-teal-400'
													: step.confidence >= 0.6
														? 'bg-amber-400'
														: 'bg-red-400'}"
												style="width: {confidenceBarWidth(step.confidence)}"
											></div>
										</div>
										<span class="flex-shrink-0 text-[11px] font-semibold {confidenceColor(step.confidence)}">
											{Math.round(step.confidence * 100)}%
										</span>
									</div>
								{/if}
								{#if step.thought}
									<p class="mb-1.5 text-xs leading-relaxed text-slate-400 break-words [overflow-wrap:anywhere]">
										{step.thought}
									</p>
								{/if}
								{#if step.resolvedItems && step.resolvedItems.length > 0}
									<div class="mb-1 flex flex-col gap-0.5">
										{#each step.resolvedItems as item (item)}
											<div class="flex items-start gap-1 text-[11px] text-teal-400">
												<span class="flex-shrink-0">✓</span>
												<span class="break-words [overflow-wrap:anywhere]">{item}</span>
											</div>
										{/each}
									</div>
								{/if}
								{#if step.unresolvedItems && step.unresolvedItems.length > 0}
									<div class="mb-1 flex flex-col gap-0.5">
										{#each step.unresolvedItems as item (item)}
											<div class="flex items-start gap-1 text-[11px] text-amber-400/80">
												<span class="flex-shrink-0">○</span>
												<span class="break-words [overflow-wrap:anywhere]">{item}</span>
											</div>
										{/each}
									</div>
								{/if}
								{#if step.needsMore}
									<div class="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
										<span class="flex-shrink-0 text-xs text-amber-400">→</span>
										<span class="flex-shrink-0 text-xs text-amber-300">Searching further</span>
										{#if step.refinedQueries && step.refinedQueries.length > 0}
											<span class="min-w-0 text-xs text-slate-500 break-words [overflow-wrap:anywhere]">
												· {step.refinedQueries[0]}
											</span>
										{/if}
									</div>
								{:else}
									<div class="mt-1 flex items-center gap-1.5">
										<span class="text-xs text-teal-400">✓</span>
										<span class="text-xs text-teal-300">Sufficient information gathered</span>
									</div>
								{/if}
							{:else if step.type === 'complete'}
								<div class="rounded-lg border border-teal-500/20 bg-teal-500/5 px-2.5 py-2">
									<div class="flex items-center justify-between gap-2">
										<p class="text-[11px] font-semibold text-teal-300">Research complete</p>
										{#if step.confidence != null}
											<span class="text-[11px] font-bold {confidenceColor(step.confidence)}">
												{Math.round(step.confidence * 100)}% confident
											</span>
										{/if}
									</div>
									{#if step.stopReason}
										<p class="mt-0.5 text-[10px] text-slate-500 break-words [overflow-wrap:anywhere]">
											{step.stopReason}
										</p>
									{/if}
								</div>
							{:else if step.type === 'synthesis_start'}
								<div class="flex items-center gap-2">
									<p class="text-xs font-semibold text-indigo-300">
										Synthesizing final answer
									</p>
									{#if isStreaming}
										<span class="flex items-center gap-0.5">
											<span
												class="h-1 w-1 rounded-full bg-indigo-400 animate-pulse"
											></span>
											<span
												class="h-1 w-1 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]"
											></span>
											<span
												class="h-1 w-1 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]"
											></span>
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
