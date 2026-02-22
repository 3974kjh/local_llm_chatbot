<script lang="ts">
	import type { Message } from '$lib/types';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import SourceCard from './SourceCard.svelte';
	import ThinkingIndicator from './ThinkingIndicator.svelte';
	import BotAvatar from './BotAvatar.svelte';
	import { formatTime } from '$lib/utils/helpers';

	let { message }: { message: Message } = $props();

	const isUser = $derived(message.role === 'user');
	const hasSources = $derived(!!message.searchResults && message.searchResults.length > 0);
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
		<div class="flex flex-col {isUser ? 'items-end' : 'items-start'}">
			{#if hasSources}
				<div class="mb-2 flex flex-wrap gap-2">
					{#each message.searchResults! as result (result.url)}
						<SourceCard {result} />
					{/each}
				</div>
			{/if}

			<div
				class="rounded-2xl px-4 py-3 {isUser
					? 'rounded-tr-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/15'
					: 'rounded-tl-sm border border-chat-border bg-chat-surface text-slate-200'}"
			>
				{#if message.isStreaming && !message.content}
					<ThinkingIndicator label={hasSources ? 'Analyzing sources' : 'Thinking'} />
				{:else if isUser}
					<p class="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
				{:else}
					<MarkdownRenderer content={message.content} />
					{#if message.isStreaming}
						<span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400"
						></span>
					{/if}
				{/if}
			</div>

			<span class="mt-1 px-1 text-[10px] text-slate-600">
				{formatTime(message.timestamp)}
			</span>
		</div>
	</div>
</div>
