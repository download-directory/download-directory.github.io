export default async function authorizedFetch(
	url: string,
	{signal}: {signal?: AbortSignal} = {},
): Promise<Response> {
	const token = globalThis.localStorage?.getItem('token');
	return fetch(url, {
		...(token
			? {
				headers: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					Authorization: `Bearer ${token}`,
				},
			}
			: {}),
		signal,
	});
}
