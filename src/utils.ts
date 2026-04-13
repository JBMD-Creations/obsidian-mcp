export function getUpstreamAuthorizeUrl({
  upstream_url,
  client_id,
  scope,
  redirect_uri,
  state,
}: {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}) {
  const upstream = new URL(upstream_url);
  upstream.searchParams.set('client_id', client_id);
  upstream.searchParams.set('redirect_uri', redirect_uri);
  upstream.searchParams.set('scope', scope);
  upstream.searchParams.set('response_type', 'code');
  if (state) {
    upstream.searchParams.set('state', state);
  }
  return upstream.href;
}

export async function fetchUpstreamAuthToken({
  client_id,
  client_secret,
  code,
  redirect_uri,
  upstream_url,
}: {
  client_id: string;
  client_secret: string;
  code: string | undefined;
  redirect_uri: string;
  upstream_url: string;
}): Promise<[string, null] | [null, Response]> {
  if (!code) {
    return [null, new Response('Missing code', { status: 400 })];
  }

  const response = await fetch(upstream_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id,
      client_secret,
      code,
      redirect_uri,
    }).toString(),
  });

  if (!response.ok) {
    return [null, new Response('Failed to fetch access token', { status: 500 })];
  }

  const body = await response.formData();
  const accessToken = body.get('access_token');
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return [null, new Response('Missing access token', { status: 400 })];
  }

  return [accessToken, null];
}

export type Props = {
  accessToken: string;
  login: string;
  name: string | null;
};
