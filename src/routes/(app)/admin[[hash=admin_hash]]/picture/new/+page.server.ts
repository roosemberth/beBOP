import type { Actions } from './$types';
import { generatePicture } from '$lib/server/picture';
import { redirect } from '@sveltejs/kit';
import { z } from 'zod';

export const actions: Actions = {
	default: async (input) => {
		const formData = await input.request.formData();

		const fields = z
			.object({
				name: z.string(),
				productId: z.string().optional(),
				picture: z.instanceof(File)
			})
			.parse(Object.fromEntries(formData));

		await generatePicture(new Uint8Array(await fields.picture.arrayBuffer()), fields.name, {
			productId: fields.productId || undefined
		});

		if (fields.productId) {
			throw redirect(303, '/admin/product/' + fields.productId);
		}

		throw redirect(303, '/admin/picture');
	}
};