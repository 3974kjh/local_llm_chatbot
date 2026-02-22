<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import ChatLayout from '$lib/components/ChatLayout.svelte';
	import AutoLayout from '$lib/components/auto/AutoLayout.svelte';
	import { autoStore } from '$lib/stores/auto.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	onMount(() => {
		const urlMode = page.url?.searchParams.get('mode');
		if (urlMode === 'auto') {
			appStore.mode = 'auto';
		}

		const kakaoStatus = page.url?.searchParams.get('kakao');
		if (kakaoStatus === 'connected') {
			autoStore.checkKakaoStatus();
		} else if (kakaoStatus === 'error') {
			const msg = page.url?.searchParams.get('msg');
			console.error('[Kakao] Connection error:', msg);
		}

		if (page.url?.search) {
			window.history.replaceState({}, '', page.url.pathname);
		}
	});
</script>

<svelte:head>
	<title>JukimBot — {appStore.mode === 'chat' ? 'Chat' : 'Auto Mode'}</title>
	<meta name="description" content="Chat with Llama 3.1 running locally via Ollama" />
</svelte:head>

{#if appStore.mode === 'chat'}
	<ChatLayout />
{:else}
	<AutoLayout />
{/if}
