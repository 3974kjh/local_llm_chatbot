<script lang="ts">
	import type { Message } from '$lib/types';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import DeepSearchMarkdownRenderer from './DeepSearchMarkdownRenderer.svelte';
	import SourceCard from './SourceCard.svelte';
	import ThinkingIndicator from './ThinkingIndicator.svelte';
	import BotAvatar from './BotAvatar.svelte';
	import ChatProgressStepper from './ChatProgressStepper.svelte';
	import DeepSearchProgress from './DeepSearchProgress.svelte';
	import RawAnswerBlock from './RawAnswerBlock.svelte';
	import { formatTime } from '$lib/utils/helpers';

	let { message }: { message: Message } = $props();

	const isUser = $derived(message.role === 'user');
	const isDeepSearch = $derived(!!message.isDeepSearch);
	const sourceResults = $derived(message.searchResults ?? []);
	const hasAnySources = $derived(!isUser && sourceResults.length > 0);
	/** Non-deep: always show strip; deep: many hits → collapsible list */
	const collapsibleDeepSources = $derived(isDeepSearch && sourceResults.length > 8);

	let copied = $state(false);
	let deepSourcesExpanded = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout>;

	async function copyContent() {
		try {
			await navigator.clipboard.writeText(message.content);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// clipboard API not available
		}
	}
</script>

<div class="animate-fade-in-up {isUser ? 'flex justify-end' : 'flex justify-start'}">
	<div class="flex max-w-[85%] gap-3 {isUser ? 'flex-row-reverse' : ''}">
		<!-- Avatar -->
		<div class="mt-1 flex-shrink-0">
			{#if isUser}
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white shadow-lg shadow-emerald-500/20"
				>
					U
				</div>
			{:else}
				<BotAvatar size={32} />
			{/if}
		</div>

		<!-- Content -->
		<div class="flex min-w-0 max-w-full flex-col {isUser ? 'items-end' : 'items-start'}">
			{#if !isUser && message.isStreaming}
				<ChatProgressStepper
					phase={message.pipelinePhase ?? 'prepare'}
					label={message.pipelineLabel ?? ''}
					detail={message.pipelineDetail ?? ''}
					mode={isDeepSearch ? 'deep' : 'chat'}
				/>
			{/if}

			{#if isDeepSearch && message.deepSearchSteps && message.deepSearchSteps.length > 0}
				<DeepSearchProgress steps={message.deepSearchSteps ?? []} isStreaming={!!message.isStreaming} />
			{/if}

			{#if !isUser && message.rawAnswer}
				<RawAnswerBlock content={message.rawAnswer} {isDeepSearch} />
			{/if}

			{#if hasAnySources}
				{#if collapsibleDeepSources}
					<div class="mb-2 w-full min-w-0 max-w-full">
						<button
							type="button"
							onclick={() => (deepSourcesExpanded = !deepSourcesExpanded)}
							class="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-chat-border bg-chat-raised px-3 py-2 text-left text-[11px] font-medium text-slate-300 transition-colors hover:bg-chat-surface"
						>
							<span>Consulted pages ({sourceResults.length})</span>
							<span class="text-slate-500">{deepSourcesExpanded ? 'Hide' : 'Show'}</span>
						</button>
						{#if deepSourcesExpanded}
							<div
								class="mt-2 max-h-72 overflow-y-auto rounded-lg border border-chat-border bg-chat-surface/40 p-2"
							>
								<div class="flex flex-wrap gap-2">
									{#each sourceResults as result (result.url)}
										<SourceCard {result} />
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<div class="mb-2 flex max-h-72 flex-wrap gap-2 overflow-y-auto">
						{#each sourceResults as result (result.url)}
							<SourceCard {result} />
						{/each}
					</div>
				{/if}
			{/if}

			{#if !isUser && message.rawAnswer && (message.content || message.isStreaming)}
				<div class="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-medium text-violet-400/70">
					<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.384a1 1 0 01-.704.28H8.346a1 1 0 01-.704-.28l-.347-.384z" />
					</svg>
					AI 요약
				</div>
			{/if}

			{#if isUser || message.content || (message.isStreaming && !message.pipelinePhase)}
			<div
				class="rounded-2xl px-4 py-3 {isUser
					? 'rounded-tr-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/15'
					: 'rounded-tl-sm border border-chat-border bg-chat-surface text-slate-200'}"
			>
				{#if message.isStreaming && !message.content && !message.pipelinePhase}
					<ThinkingIndicator
						label={isDeepSearch ? 'Deep researching' : hasAnySources ? 'Analyzing sources' : 'Thinking'}
					/>
				{:else if isUser}
					{#if message.attachedSeedUrls && message.attachedSeedUrls.length > 0}
						<div class="mb-2 flex w-full min-w-0 flex-col gap-1.5 border-b border-white/15 pb-2">
							<p class="text-[10px] font-medium uppercase tracking-wide text-violet-200/90">
								Attached URLs
							</p>
							{#each message.attachedSeedUrls as u (u)}
								<a
									href={u}
									target="_blank"
									rel="noopener noreferrer"
									class="block text-left text-[11px] text-violet-100/95 underline decoration-white/30 underline-offset-2 break-all [overflow-wrap:anywhere] hover:decoration-white/60"
								>
									{u}
								</a>
							{/each}
						</div>
					{/if}
					<p class="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
				{:else if isDeepSearch}
					<DeepSearchMarkdownRenderer content={message.content} />
					{#if message.isStreaming}
						<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400"></span>
					{/if}
				{:else}
					<MarkdownRenderer content={message.content} />
					{#if message.isStreaming}
						<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400"></span>
					{/if}
				{/if}
			</div>
			{/if}

			<div class="mt-1 flex items-center gap-2 px-1">
				<span class="text-[10px] text-slate-600">{formatTime(message.timestamp)}</span>
				{#if !isUser && !message.isStreaming && message.content}
					<button
						onclick={copyContent}
						title={copied ? 'Copied!' : 'Copy response'}
						class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-all {copied
							? 'text-teal-400'
							: 'text-slate-600 hover:text-slate-400'}"
					>
						{#if copied}
							<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.5"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Copied
						{:else}
							<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
							Copy
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
