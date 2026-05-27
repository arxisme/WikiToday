import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
	duration: number;
}

export const toasts = writable<Toast[]>([]);

export function addToast(message: string, type: Toast['type'] = 'info', duration = 3500) {
	const id = Math.random().toString(36).substring(2, 9);
	toasts.update((all) => [...all, { id, message, type, duration }]);
	setTimeout(() => {
		removeToast(id);
	}, duration);
}

export function removeToast(id: string) {
	toasts.update((all) => all.filter((t) => t.id !== id));
}
