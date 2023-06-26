import { collections } from '$lib/server/database.js';
import { createOrder } from '$lib/server/orders.js';
import { runtimeConfig } from '$lib/server/runtime-config.js';
import { filterUndef } from '$lib/utils/filterUndef.js';
import { error, redirect } from '@sveltejs/kit';
import { subSeconds } from 'date-fns';

export async function load({ params }) {
	const subscription = await collections.paidSubscriptions.findOne({
		_id: params.id
	});

	if (!subscription) {
		throw error(404, 'Subscription not found');
	}

	const product = await collections.products.findOne({
		_id: subscription.productId
	});

	if (!product) {
		throw error(500, 'Product associated to subscription not found');
	}

	const picture = await collections.pictures.findOne(
		{
			productId: product._id
		},
		{ sort: { createdAt: 1 } }
	);

	const canRenewAfter = subSeconds(
		subscription.paidUntil,
		runtimeConfig.subscriptionReminderSeconds
	);

	return {
		subscription: {
			createdAt: subscription.createdAt,
			npub: subscription.npub,
			paidUntil: subscription.paidUntil,
			number: subscription.number
		},
		product: {
			_id: product._id,
			name: product.name
		},
		picture: picture ?? undefined,
		canRenew: canRenewAfter < new Date()
	};
}

export const actions = {
	renew: async function ({ params, locals }) {
		const subscription = await collections.paidSubscriptions.findOne({
			_id: params.id
		});

		if (!subscription) {
			throw error(404, 'Subscription not found');
		}

		const product = await collections.products.findOne({
			_id: subscription.productId
		});

		if (!product) {
			throw error(500, 'Product associated to subscription not found');
		}

		const orConditions = filterUndef([
			subscription.npub ? { 'notifications.paymentStatus.npub': subscription.npub } : undefined,
			subscription.email ? { 'notifications.paymentStatus.email': subscription.email } : undefined
		]);

		if (!orConditions.length) {
			throw error(500, 'No npub or email found for this subscription');
		}

		const lastOrder = await collections.orders.findOne(
			{
				'items.product._id': product._id,
				'payment.status': 'paid',
				$or: orConditions
			},
			{
				sort: { createdAt: -1 }
			}
		);

		if (!lastOrder) {
			throw error(500, 'No paid order found for this subscription');
		}

		const orderId = await createOrder(
			[
				{
					quantity: 1,
					product
				}
			],
			lastOrder.payment.method,
			{
				sessionId: locals.sessionId,
				shippingAddress: lastOrder.shippingAddress,
				notifications: lastOrder.notifications
			}
		);

		throw redirect(303, `/order/${orderId}`);
	}
};