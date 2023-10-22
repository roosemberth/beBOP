import { z } from 'zod';
import { sendAuthentificationlink } from '$lib/server/sendNotification';
import { bech32 } from 'bech32';
import { jwtVerify } from 'jose';
import { runtimeConfig } from '$lib/server/runtime-config.js';
import { fail, redirect } from '@sveltejs/kit';
import { collections } from '$lib/server/database.js';
import { addDays } from 'date-fns';
import {
	FACEBOOK_ID,
	FACEBOOK_SECRET,
	GITHUB_ID,
	GITHUB_SECRET,
	GOOGLE_ID,
	GOOGLE_SECRET,
	TWITTER_ID,
	TWITTER_SECRET
} from '$env/static/private';

export const load = async ({ url }) => {
	const token = url.searchParams.get('token');

	const base = {
		canSso: {
			github: !!(GITHUB_ID && GITHUB_SECRET),
			google: !!(GOOGLE_ID && GOOGLE_SECRET),
			facebook: !!(FACEBOOK_ID && FACEBOOK_SECRET),
			twitter: !!(TWITTER_ID && TWITTER_SECRET)
		}
	};

	if (token) {
		try {
			const authLink = await jwtVerify(token, Buffer.from(runtimeConfig.authLinkJwtSigningKey));

			const { npub, email } = z
				.object({
					npub: z.string().optional(),
					email: z.string().optional()
				})
				.parse(authLink.payload);

			if (npub) {
				return {
					...base,
					npubToLogin: npub
				};
			} else if (email) {
				return {
					...base,
					emailToLogin: email
				};
			}
		} catch (err) {
			return { ...base, error: 'Invalid or expired token' };
		}
	}

	return base;
};

export const actions = {
	sendLink: async function ({ request }) {
		const data = await request.formData();
		const { address } = z
			.object({
				address: z.union([
					z.string().email(),
					z
						.string()
						.startsWith('npub')
						.refine((npubAddress) => bech32.decodeUnsafe(npubAddress, 90)?.prefix === 'npub', {
							message: 'Invalid npub address'
						})
				])
			})
			.parse({
				address: data.get('address')
			});

		await sendAuthentificationlink(address.includes('@') ? { email: address } : { npub: address });
		return { address, successUser: true };
	},
	validate: async function ({ url, locals }) {
		const token = url.searchParams.get('token');
		let dontCatch = false;

		if (!token) {
			return fail(400, { error: 'Invalid or expired token' });
		}
		try {
			const authLink = await jwtVerify(token, Buffer.from(runtimeConfig.authLinkJwtSigningKey));

			const { npub, email } = z
				.object({
					npub: z.string().optional(),
					email: z.string().optional()
				})
				.parse(authLink.payload);

			await collections.sessions.updateOne(
				{
					sessionId: locals.sessionId
				},
				{
					$setOnInsert: {
						createdAt: new Date()
					},
					$set: {
						updatedAt: new Date(),
						expiresAt: addDays(new Date(), 1),
						...(npub && { npub }),
						...(email && { email })
					}
				},
				{
					upsert: true
				}
			);

			dontCatch = true;
			throw redirect(303, '/customer/login');
		} catch (err) {
			if (dontCatch) {
				throw err;
			}
			return fail(400, { error: 'Invalid or expired token' });
		}
	},
	clearEmail: async function ({ locals }) {
		await collections.sessions.updateOne(
			{ sessionId: locals.sessionId },
			{ $unset: { email: '' } }
		);
	},
	clearNpub: async function ({ locals }) {
		await collections.sessions.updateOne({ sessionId: locals.sessionId }, { $unset: { npub: '' } });
	},
	clearUserId: async function ({ locals }) {
		await collections.sessions.updateOne(
			{ sessionId: locals.sessionId },
			{ $unset: { userId: '' } }
		);
	},
	clearSso: async function ({ locals, request }) {
		const { provider } = z
			.object({
				provider: z.enum(['github', 'google', 'facebook', 'twitter'])
			})
			.parse(Object.fromEntries(await request.formData()));

		await collections.sessions.updateOne(
			{ sessionId: locals.sessionId },
			{ $pull: { sso: { provider } } }
		);
	},
	clearAll: async function (event) {
		await collections.sessions.deleteOne({ sessionId: event.locals.sessionId });

		event.locals.sessionId = crypto.randomUUID();
		event.cookies.delete('bootik-session', {
			path: '/'
		});
	}
};