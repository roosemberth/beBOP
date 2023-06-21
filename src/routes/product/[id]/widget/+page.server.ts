import { collections } from '$lib/server/database';
import type { Product } from '$lib/types/Product';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from '../$types';
import { runtimeConfig } from '$lib/server/runtime-config';

export const load: PageServerLoad = async ({ params }) => {
	const product = await collections.products.findOne<
		Pick<
			Product,
			| '_id'
			| 'name'
			| 'price'
			| 'shortDescription'
			| 'description'
			| 'availableDate'
			| 'preorder'
			| 'type'
		>
	>(
		{ _id: params.id },
		{
			projection: {
				_id: 1,
				name: 1,
				price: 1,
				shortDescription: 1,
				description: 1,
				availableDate: 1,
				preorder: 1,
				type: 1
			}
		}
	);

	if (!product) {
		throw error(404, 'Resource not found');
	}

	const pictures = await collections.pictures
		.find({ productId: params.id })
		.sort({ createdAt: 1 })
		.toArray();

	return {
		product,
		picture: pictures[0],
		showCheckoutButton: runtimeConfig.checkoutButtonOnProductPage
	};
};