<script lang="ts">
	import MessageBubble from './MessageBubble.svelte';
	import BotAvatar from './BotAvatar.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';

	let container: HTMLDivElement;

	function scrollToBottom() {
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}

	$effect(() => {
		const messages = chatStore.activeMessages;
		if (messages.length === 0) return;

		const lastMsg = messages[messages.length - 1];
		const _trackContent = lastMsg?.content;
		const _trackStreaming = lastMsg?.isStreaming;

		requestAnimationFrame(scrollToBottom);
	});
</script>

<div bind:this={container} class="flex-1 overflow-y-auto scroll-smooth">
	{#if chatStore.activeMessages.length === 0}
		<!-- Empty state -->
		<div class="flex h-full flex-col items-center justify-center px-4 text-center">
			<div class="mb-6">
				<BotAvatar size={80} />
			</div>
			<h2 class="mb-2 text-2xl font-semibold text-slate-200">How can I help you?</h2>
			<p class="max-w-md text-sm text-slate-500">
				Ask me anything. I'm JukimBot, powered by Llama 3.1 running locally on your machine. Toggle
				web search for up-to-date information.
			</p>

			<div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each suggestions as suggestion}
					<button
						onclick={() => chatStore.sendMessage(suggestion)}
						class="rounded-xl border border-chat-border bg-chat-surface px-4 py-3 text-left text-sm text-slate-400 transition-all hover:border-violet-500/30 hover:bg-chat-raised hover:text-slate-300"
					>
						{suggestion}
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<div class="mx-auto max-w-3xl space-y-6 px-4 py-6">
			{#each chatStore.activeMessages as message (message.id)}
				<MessageBubble {message} />
			{/each}
		</div>
	{/if}
</div>

<script lang="ts" module>
	const suggestions = [
		'Explain quantum computing simply',
		'What are the latest trends in AI?',
		'Write a Python function to sort a list',
		'Help me plan a weekend trip'
	];
</script>
