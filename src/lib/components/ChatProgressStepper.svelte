<script lang="ts">
	import type { ChatPipelinePhase } from '$lib/types';
	import { PIPELINE_PHASES, PHASE_LABELS } from '$lib/chatPipeline';

	let {
		phase = 'prepare',
		label = '',
		detail = '',
		mode = 'chat'
	}: {
		phase?: ChatPipelinePhase;
		label?: string;
		detail?: string;
		mode?: 'chat' | 'deep';
	} = $props();

	const currentIndex = $derived(PIPELINE_PHASES.indexOf(phase));

	const subtitle = $derived(
		[label, detail].filter(Boolean).join(' · ') ||
			(mode === 'deep' && phase === 'analyze' ? '상세 로그에서 진행 상황을 확인할 수 있습니다' : '')
	);

	function stepState(index: number): 'completed' | 'current' | 'pending' {
		if (phase === 'complete') return 'completed';
		if (index < currentIndex) return 'completed';
		if (index === currentIndex) return 'current';
		return 'pending';
	}
</script>

<div
	class="mb-2 w-full min-w-0 max-w-full rounded-lg border border-chat-border bg-chat-raised/80 px-3 py-2.5"
	role="status"
	aria-live="polite"
>
	<div class="flex items-center justify-between gap-2">
		{#each PIPELINE_PHASES as stepPhase, index (stepPhase)}
			{@const state = stepState(index)}
			<div class="flex min-w-0 flex-1 items-center {index < PIPELINE_PHASES.length - 1 ? '' : ''}">
				<div class="flex min-w-0 flex-col items-center gap-1">
					<div
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors
							{state === 'completed'
							? 'border-teal-500/60 bg-teal-500/20 text-teal-400'
							: state === 'current'
								? 'border-violet-400 bg-violet-500/20'
								: 'border-chat-border bg-chat-surface text-slate-600'}"
					>
						{#if state === 'completed'}
							<svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path
									d="M2 6l3 3 5-5"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else if state === 'current'}
							<span class="dot-pulse h-2 w-2 rounded-full bg-violet-400"></span>
						{:else}
							<span class="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
						{/if}
					</div>
					<span
						class="max-w-[3.5rem] truncate text-center text-[10px] leading-tight
							{state === 'current'
							? 'font-semibold text-violet-300'
							: state === 'completed'
								? 'text-slate-400'
								: 'text-slate-600'}"
					>
						{PHASE_LABELS[stepPhase]}
					</span>
				</div>
				{#if index < PIPELINE_PHASES.length - 1}
					<div
						class="mx-0.5 h-px min-w-[8px] flex-1 transition-colors
							{index < currentIndex || phase === 'complete' ? 'bg-teal-500/40' : 'bg-chat-border'}"
					></div>
				{/if}
			</div>
		{/each}
	</div>

	{#if subtitle}
		<p class="mt-2 text-[11px] text-slate-400">
			<span class="font-medium text-slate-300">{PHASE_LABELS[phase]}</span>
			<span class="text-slate-500"> — </span>
			{subtitle}
		</p>
	{/if}
</div>
