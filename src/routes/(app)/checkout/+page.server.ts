import { collections } from '$lib/server/database';
import { paymentMethods } from '$lib/server/payment-methods.js';
import { COUNTRY_ALPHA3S } from '$lib/types/Country';
import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { bech32 } from 'bech32';
import { createOrder } from '$lib/server/orders.js';
import { emailsEnabled } from '$lib/server/email.js';

export function load() {
	return {
		paymentMethods: paymentMethods(),
		emailsEnabled
	};
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!paymentMethods().length) {
			throw error(500, 'No payment methods configured for the bootik');
		}
		const cart = await collections.carts.findOne({ sessionId: locals.sessionId });

		if (!cart?.items.length) {
			throw error(400, 'Cart is empty');
		}

		const products = await collections.products
			.find({
				_id: { $in: cart.items.map((item) => item.productId) }
			})
			.toArray();

		const byId = Object.fromEntries(products.map((product) => [product._id, product]));

		cart.items = cart.items.filter((item) => !!byId[item.productId]);

		if (!cart?.items.length) {
			throw error(400, 'Cart is empty');
		}

		const formData = await request.formData();

		const isDigital = products.every((product) => !product.shipping);

		const shipping = isDigital
			? null
			: z
					.object({
						firstName: z.string().min(1),
						lastName: z.string().min(1),
						address: z.string().min(1),
						city: z.string().min(1),
						state: z.string().optional(),
						zip: z.string().min(1),
						country: z.enum(COUNTRY_ALPHA3S)
					})
					.parse(Object.fromEntries(formData));

		const notifications = z
			.object({
				paymentStatusNPUB: z
					.string()
					.startsWith('npub')
					.refine((npubAddress) => bech32.decodeUnsafe(npubAddress, 90)?.prefix === 'npub', {
						message: 'Invalid npub address'
					})
					.optional(),
				paymentStatusEmail: z.string().email().optional()
			})
			.parse({
				paymentStatusNPUB: formData.get('paymentStatusNPUB') || undefined,
				paymentStatusEmail: formData.get('paymentStatusEmail') || undefined
			});

		const npubAddress = notifications?.paymentStatusNPUB;
		const email = notifications?.paymentStatusEmail;

		// Remove empty string
		if (shipping && !shipping.state) {
			delete shipping.state;
		}

		const paymentMethod = z
			.object({
				paymentMethod: z.enum([paymentMethods()[0], ...paymentMethods().slice(1)])
			})
			.parse(Object.fromEntries(formData)).paymentMethod;

		const orderId = await createOrder(
			cart.items.map((item) => ({
				quantity: item.quantity,
				product: byId[item.productId]
			})),
			paymentMethod,
			{
				sessionId: locals.sessionId,
				notifications: {
					paymentStatus: {
						npub: npubAddress,
						email
					}
				},
				shippingAddress: shipping,
				cb: (session) => collections.carts.deleteOne({ _id: cart._id }, { session })
			}
		);

		throw redirect(303, `/order/${orderId}`);
	}
};