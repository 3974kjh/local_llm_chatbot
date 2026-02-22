class AppStore {
	mode = $state<'chat' | 'auto'>('chat');
}

export const appStore = new AppStore();
