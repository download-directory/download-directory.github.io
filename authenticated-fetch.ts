export default async function authenticatedFetch(
	url: string,
	{signal, method}: {signal?: AbortSignal; method?: 'HEAD'} = {},
): Promise<Response> {
	const token = globalThis.localStorage?.getItem('token');

	const response = await fetch(url, {
		method,
		signal,
		...(token
			? {
				headers: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					Authorization: `Bearer ${token}`,
				},
			}
			: {}),
	});

	switch (response.status) {
		case 401: {
			throw new Error('Invalid token');
		}

		case 403:
		case 429: {
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				throw new Error('Rate limit exceeded');
			}

			break;
		}

		default:
	}

	return response;
}
