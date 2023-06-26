import { collections } from '$lib/server/database.js';
import { runtimeConfig } from '$lib/server/runtime-config';
import type { Product } from '$lib/types/Product.js';
import { UrlDependency } from '$lib/types/UrlDependency';
import { filterUndef } from '$lib/utils/filterUndef.js';

export async function load({ depends, locals }) {
	depends(UrlDependency.ExchangeRate);
	depends(UrlDependency.Cart);

	const cart = await collections.carts.findOne({ sessionId: locals.sessionId });

	const logoPicture = runtimeConfig.logoPictureId
		? await collections.pictures.findOne({ _id: runtimeConfig.logoPictureId })
		: null;

	return {
		isMaintenance: runtimeConfig.isMaintenance,
		exchangeRate: runtimeConfig.BTC_EUR,
		brandName: runtimeConfig.brandName,
		logoPicture,
		links: {
			footer: runtimeConfig.footerLinks,
			navbar: runtimeConfig.navbarLinks,
			topbar: runtimeConfig.topbarLinks
		},
		logo: runtimeConfig.logoPictureId,
		cart: cart
			? Promise.all(
					cart.items.map(async (item) => {
						const productDoc = await collections.products.findOne<
							Pick<
								Product,
								| '_id'
								| 'name'
								| 'price'
								| 'shortDescription'
								| 'type'
								| 'availableDate'
								| 'shipping'
								| 'preorder'
							>
						>(
							{ _id: item.productId },
							{
								projection: {
									_id: 1,
									name: 1,
									price: 1,
									shortDescription: 1,
									type: 1,
									shipping: 1,
									availableDate: 1,
									preorder: 1
								}
							}
						);
						if (productDoc) {
							return {
								product: productDoc,
								picture: await collections.pictures.findOne(
									{ productId: item.productId },
									{ sort: { createdAt: 1 } }
								),
								quantity: item.quantity
							};
						}
					})
			  ).then((res) => filterUndef(res))
			: null
	};
}