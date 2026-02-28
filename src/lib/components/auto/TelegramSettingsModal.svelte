<script lang="ts">
	import type { TelegramBotConfig, TelegramChatConfig } from '$lib/types/auto';
	import { telegramConfigsStore } from '$lib/stores/telegramConfigs.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Bot form
	let newBotName = $state('');
	let newBotToken = $state('');
	let botAddError = $state<string | null>(null);
	let editingBotId = $state<string | null>(null);
	let editBotName = $state('');
	let editBotToken = $state('');

	// Chat form
	let newChatName = $state('');
	let newChatId = $state('');
	let chatAddError = $state<string | null>(null);
	let editingChatId = $state<string | null>(null);
	let editChatName = $state('');
	let editChatIdVal = $state('');

	function handleAddBot() {
		botAddError = null;
		const name = newBotName.trim();
		if (!name) {
			botAddError = '이름을 입력하세요.';
			return;
		}
		if (!newBotToken.trim()) {
			botAddError = 'Bot Token을 입력하세요.';
			return;
		}
		const id = telegramConfigsStore.addBot(name, newBotToken);
		if (id) {
			newBotName = '';
			newBotToken = '';
		} else {
			botAddError = '이름이 중복되었습니다.';
		}
	}

	function startEditBot(bot: TelegramBotConfig) {
		editingBotId = bot.id;
		editBotName = bot.name;
		editBotToken = bot.botToken;
	}

	function saveEditBot() {
		if (!editingBotId) return;
		if (telegramConfigsStore.updateBot(editingBotId, { name: editBotName, botToken: editBotToken })) {
			editingBotId = null;
		}
	}

	function removeBot(bot: TelegramBotConfig) {
		if (confirm(`"${bot.name}" 봇을 삭제할까요?`)) telegramConfigsStore.removeBot(bot.id);
	}

	function handleAddChat() {
		chatAddError = null;
		const name = newChatName.trim();
		if (!name) {
			chatAddError = '이름을 입력하세요.';
			return;
		}
		if (!newChatId.trim()) {
			chatAddError = 'Chat ID를 입력하세요.';
			return;
		}
		const id = telegramConfigsStore.addChat(name, newChatId);
		if (id) {
			newChatName = '';
			newChatId = '';
		} else {
			chatAddError = '이름이 중복되었습니다.';
		}
	}

	function startEditChat(chat: TelegramChatConfig) {
		editingChatId = chat.id;
		editChatName = chat.name;
		editChatIdVal = chat.chatId;
	}

	function saveEditChat() {
		if (!editingChatId) return;
		if (telegramConfigsStore.updateChat(editingChatId, { name: editChatName, chatId: editChatIdVal })) {
			editingChatId = null;
		}
	}

	function removeChat(chat: TelegramChatConfig) {
		if (confirm(`"${chat.name}" 수신처를 삭제할까요?`)) telegramConfigsStore.removeChat(chat.id);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		onclick={() => (open = false)}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	></div>

	<div
		class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-chat-border bg-chat-surface shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="telegram-modal-title"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
	>
		<div class="flex items-center justify-between border-b border-chat-border px-5 py-4">
			<h2 id="telegram-modal-title" class="text-sm font-semibold text-slate-200">텔레그램 봇 · 수신처 설정</h2>
			<button
				onclick={() => (open = false)}
				class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-chat-raised hover:text-slate-300"
				aria-label="닫기"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="max-h-[70vh] overflow-y-auto p-5 space-y-6">
			<!-- Bots -->
			<div class="rounded-xl border border-chat-border bg-chat-raised/50 p-4 space-y-3">
				<p class="text-xs font-medium text-slate-400">봇 (Bot Token)</p>
				<div>
					<label for="tg-bot-name" class="block text-[10px] text-slate-500 mb-1">이름</label>
					<input
						id="tg-bot-name"
						type="text"
						bind:value={newBotName}
						placeholder="예: 내 뉴스봇"
						class="w-full rounded-lg border border-chat-border bg-chat-bg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/40 outline-none"
					/>
				</div>
				<div>
					<label for="tg-bot-token" class="block text-[10px] text-slate-500 mb-1">Bot Token</label>
					<input
						id="tg-bot-token"
						type="password"
						bind:value={newBotToken}
						placeholder="7123456789:AAH..."
						class="w-full rounded-lg border border-chat-border bg-chat-bg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/40 outline-none"
					/>
				</div>
				{#if botAddError}
					<p class="text-xs text-red-400">{botAddError}</p>
				{/if}
				<button
					onclick={handleAddBot}
					class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500"
				>
					봇 추가
				</button>
				<div class="pt-2">
					<p class="text-[10px] text-slate-500 mb-2">등록된 봇 ({telegramConfigsStore.bots.length})</p>
					{#if telegramConfigsStore.bots.length === 0}
						<p class="text-[10px] text-slate-600">없음</p>
					{:else}
						<ul class="space-y-2">
							{#each telegramConfigsStore.bots as bot (bot.id)}
								<li class="rounded-lg border border-chat-border bg-chat-bg/50 p-2">
									{#if editingBotId === bot.id}
										<div class="space-y-2">
											<input
												type="text"
												bind:value={editBotName}
												placeholder="이름"
												class="w-full rounded border border-chat-border bg-chat-bg px-2 py-1.5 text-sm outline-none focus:border-sky-500/40"
											/>
											<input
												type="password"
												bind:value={editBotToken}
												placeholder="Bot Token"
												class="w-full rounded border border-chat-border bg-chat-bg px-2 py-1.5 text-sm outline-none focus:border-sky-500/40"
											/>
											<div class="flex gap-2">
												<button onclick={saveEditBot} class="rounded bg-sky-600 px-2 py-1 text-xs text-white">저장</button>
												<button onclick={() => (editingBotId = null)} class="rounded border px-2 py-1 text-xs text-slate-400">취소</button>
											</div>
										</div>
									{:else}
										<div class="flex items-center justify-between gap-2">
											<span class="text-sm text-slate-200">{bot.name}</span>
											<div class="flex gap-1">
												<button onclick={() => startEditBot(bot)} class="rounded p-1 text-slate-500 hover:text-sky-400" aria-label="편집">✎</button>
												<button onclick={() => removeBot(bot)} class="rounded p-1 text-slate-500 hover:text-red-400" aria-label="삭제">×</button>
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			<!-- Chats (수신처) -->
			<div class="rounded-xl border border-chat-border bg-chat-raised/50 p-4 space-y-3">
				<p class="text-xs font-medium text-slate-400">수신처 (Chat ID)</p>
				<div>
					<label for="tg-chat-name" class="block text-[10px] text-slate-500 mb-1">이름</label>
					<input
						id="tg-chat-name"
						type="text"
						bind:value={newChatName}
						placeholder="예: 내 대화방 / 그룹방"
						class="w-full rounded-lg border border-chat-border bg-chat-bg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/40 outline-none"
					/>
				</div>
				<div>
					<label for="tg-chat-id" class="block text-[10px] text-slate-500 mb-1">Chat ID</label>
					<input
						id="tg-chat-id"
						type="text"
						bind:value={newChatId}
						placeholder="123456789 또는 -1001234567890"
						class="w-full rounded-lg border border-chat-border bg-chat-bg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/40 outline-none"
					/>
				</div>
				{#if chatAddError}
					<p class="text-xs text-red-400">{chatAddError}</p>
				{/if}
				<button
					onclick={handleAddChat}
					class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500"
				>
					수신처 추가
				</button>
				<div class="pt-2">
					<p class="text-[10px] text-slate-500 mb-2">등록된 수신처 ({telegramConfigsStore.chats.length})</p>
					{#if telegramConfigsStore.chats.length === 0}
						<p class="text-[10px] text-slate-600">없음</p>
					{:else}
						<ul class="space-y-2">
							{#each telegramConfigsStore.chats as chat (chat.id)}
								<li class="rounded-lg border border-chat-border bg-chat-bg/50 p-2">
									{#if editingChatId === chat.id}
										<div class="space-y-2">
											<input
												type="text"
												bind:value={editChatName}
												placeholder="이름"
												class="w-full rounded border border-chat-border bg-chat-bg px-2 py-1.5 text-sm outline-none focus:border-sky-500/40"
											/>
											<input
												type="text"
												bind:value={editChatIdVal}
												placeholder="Chat ID"
												class="w-full rounded border border-chat-border bg-chat-bg px-2 py-1.5 text-sm outline-none focus:border-sky-500/40"
											/>
											<div class="flex gap-2">
												<button onclick={saveEditChat} class="rounded bg-sky-600 px-2 py-1 text-xs text-white">저장</button>
												<button onclick={() => (editingChatId = null)} class="rounded border px-2 py-1 text-xs text-slate-400">취소</button>
											</div>
										</div>
									{:else}
										<div class="flex items-center justify-between gap-2">
											<span class="text-sm text-slate-200">{chat.name}</span>
											<div class="flex gap-1">
												<button onclick={() => startEditChat(chat)} class="rounded p-1 text-slate-500 hover:text-sky-400" aria-label="편집">✎</button>
												<button onclick={() => removeChat(chat)} class="rounded p-1 text-slate-500 hover:text-red-400" aria-label="삭제">×</button>
											</div>
										</div>
										<p class="mt-1 text-[10px] text-slate-500">Chat ID: {chat.chatId}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
