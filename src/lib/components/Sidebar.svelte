<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte';
	import { formatRelativeDate } from '$lib/utils/helpers';
	import BotAvatar from './BotAvatar.svelte';

	function handleNewChat() {
		chatStore.createConversation();
	}

	function handleSelect(id: string) {
		chatStore.selectConversation(id);
		if (window.innerWidth < 768) {
			chatStore.sidebarOpen = false;
		}
	}

	function handleDelete(e: MouseEvent, id: string) {
		e.stopPropagation();
		chatStore.deleteConversation(id);
	}
</script>

<aside class="flex h-full flex-col bg-chat-surface">
	<!-- Header -->
	<div class="p-4">
		<div class="mb-4 flex items-center gap-3">
			<BotAvatar size={36} />
			<div>
				<h2 class="text-sm font-semibold text-slate-200">JukimBot</h2>
				<p class="text-[10px] text-slate-500">Local AI Assistant</p>
			</div>
		</div>

		<button
			onclick={handleNewChat}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-500 hover:shadow-violet-500/25 active:scale-[0.98]"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 4v16m8-8H4"
				/>
			</svg>
			New Chat
		</button>
	</div>

	<!-- Conversation List -->
	<div class="flex-1 overflow-y-auto px-2 pb-4">
		{#if chatStore.sortedConversations.length === 0}
			<div class="px-3 py-8 text-center text-xs text-slate-600">No conversations yet</div>
		{:else}
			{#each chatStore.sortedConversations as conv (conv.id)}
				<div
					role="button"
					tabindex="0"
					onclick={() => handleSelect(conv.id)}
					onkeydown={(e) => e.key === 'Enter' && handleSelect(conv.id)}
					class="group mb-0.5 flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-all {conv.id ===
					chatStore.activeId
						? 'bg-chat-raised text-slate-200'
						: 'text-slate-400 hover:bg-chat-raised/50 hover:text-slate-300'}"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{conv.title}</p>
						<p class="mt-0.5 text-[10px] text-slate-600">
							{formatRelativeDate(conv.updatedAt)}
						</p>
					</div>

					<button
						onclick={(e) => handleDelete(e, conv.id)}
						class="flex-shrink-0 rounded p-1 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
						aria-label="Delete conversation"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</button>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Footer -->
	<div class="border-t border-chat-border p-3">
		<div class="flex items-center gap-2 text-[10px] text-slate-600">
			<div class="h-2 w-2 rounded-full bg-emerald-500"></div>
			<span>Ollama Connected</span>
		</div>
	</div>
</aside>
