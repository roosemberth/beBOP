import { adminPrefix } from '$lib/server/admin.js';
import { collections } from '$lib/server/database';
import { onOrderPayment, onOrderPaymentFailed } from '$lib/server/orders';
import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';

export const actions = {
	confirm: async ({ params, request }) => {
		const order = await collections.orders.findOne({
			_id: params.id
		});

		if (!order) {
			throw error(404, 'Order not found');
		}

		const payment = order.payments.find((payment) => payment._id.equals(params.paymentId));

		if (!payment) {
			throw error(404, 'Payment not found');
		}

		if (payment.status !== 'pending') {
			throw error(400, 'Payment is not pending');
		}
		const formData = await request.formData();
		const parsed =
			payment.method === 'bankTransfer'
				? z
						.object({
							bankTransferNumber: z.string().trim().min(1).max(100)
						})
						.parse({
							bankTransferNumber: formData.get('bankTransferNumber')
						})
				: null;

		await onOrderPayment(order, payment, payment.price, {
			...(parsed && parsed.bankTransferNumber && { bankTransferNumber: parsed.bankTransferNumber })
		});

		throw redirect(303, request.headers.get('referer') || `${adminPrefix()}/order`);
	},
	cancel: async ({ params, request }) => {
		const order = await collections.orders.findOne({
			_id: params.id
		});

		if (!order) {
			throw error(404, 'Order not found');
		}

		const payment = order.payments.find((payment) => payment._id.equals(params.paymentId));

		if (!payment) {
			throw error(404, 'Payment not found');
		}

		if (payment.status !== 'pending') {
			throw error(400, 'Payment is not pending');
		}

		await onOrderPaymentFailed(order, payment, 'canceled');

		throw redirect(303, request.headers.get('referer') || `${adminPrefix()}/order`);
	}
};