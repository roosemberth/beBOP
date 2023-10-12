import { runtimeConfig } from '$lib/server/runtime-config';

export async function load() {
	return {
		plausibleScriptUrl: runtimeConfig.plausibleScriptUrl
	};
}