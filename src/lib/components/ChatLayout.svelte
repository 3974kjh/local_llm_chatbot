<script lang="ts">
	import Sidebar from './Sidebar.svelte';
	import MessageList from './MessageList.svelte';
	import ChatInput from './ChatInput.svelte';
	import BotAvatar from './BotAvatar.svelte';
	import ModeToggle from './ModeToggle.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';

	function handleNewChat() {
		chatStore.createConversation();
	}

	function toggleSidebar() {
		chatStore.sidebarOpen = !chatStore.sidebarOpen;
	}

	function closeSidebar() {
		chatStore.sidebarOpen = false;
	}
</script>

<div class="flex h-screen overflow-hidden bg-chat-bg text-slate-200">
	<!-- Mobile sidebar overlay -->
	{#if chatStore.sidebarOpen}
		<div class="fixed inset-0 z-40 md:hidden">
			<button
				class="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onclick={closeSidebar}
				aria-label="Close sidebar"
			></button>
			<div class="relative z-50 h-full w-72 shadow-2xl shadow-black/50">
				<Sidebar />
			</div>
		</div>
	{/if}

	<!-- Desktop sidebar -->
	{#if chatStore.sidebarOpen}
		<div class="hidden w-72 flex-shrink-0 border-r border-chat-border md:block">
			<Sidebar />
		</div>
	{/if}

	<!-- Main Content -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top Bar -->
		<header
			class="flex items-center justify-between border-b border-chat-border bg-chat-surface/60 px-4 py-3 backdrop-blur-md"
		>
			<div class="flex items-center gap-3">
				<button
					onclick={toggleSidebar}
					class="rounded-lg p-2 transition-colors hover:bg-chat-raised"
					aria-label="Toggle sidebar"
				>
					<!-- Hamburger menu icon (always same regardless of sidebar state) -->
					<svg class="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none">
						<line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
						<line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
						<line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>

				<div class="flex items-center gap-2.5">
					<BotAvatar size={32} />
					<div>
						<h1 class="text-sm font-semibold">JukimBot</h1>
						<p class="text-[10px] text-slate-500">llama3.1:8b &middot; Local</p>
					</div>
				</div>
			</div>

		<div class="flex items-center gap-3">
			<ModeToggle />

			{#if chatStore.activeConversation}
					<button
						onclick={() => chatStore.clearConversation()}
						class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-chat-raised hover:text-slate-300"
						aria-label="Clear conversation"
						title="Clear conversation"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</button>
				{/if}

				<button
					onclick={handleNewChat}
					class="flex items-center gap-1.5 rounded-lg bg-chat-raised px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-violet-600 hover:text-white"
					aria-label="New chat"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<span class="hidden sm:inline">New Chat</span>
				</button>
			</div>
		</header>

		<!-- Messages -->
		<MessageList />

		<!-- Input -->
		<ChatInput />
	</div>
</div>
