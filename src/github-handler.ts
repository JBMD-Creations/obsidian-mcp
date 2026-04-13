import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import { Octokit } from 'octokit';
import { getVaultConfig } from './config';
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from './utils';
import {
  addApprovedClient,
  bindStateToSession,
  createOAuthState,
  generateCSRFProtection,
  isClientApproved,
  OAuthError,
  renderApprovalDialog,
  validateCSRFToken,
  validateOAuthState,
} from './workers-oauth-utils';

type AppBindings = Env & {
  COOKIE_ENCRYPTION_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
};

const app = new Hono<{ Bindings: AppBindings }>();

app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text('Invalid request', 400);
  }

  if (await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
    const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
    const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);
    return redirectToGithub(c.env, c.req.raw, stateToken, { 'Set-Cookie': sessionBindingCookie });
  }

  const { token: csrfToken, setCookie } = generateCSRFProtection();

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    csrfToken,
    server: {
      description: 'Safe append/create note capture for a private Obsidian vault.',
      logo: 'https://avatars.githubusercontent.com/u/314135?s=200&v=4',
      name: 'Obsidian MCP',
    },
    setCookie,
    state: { oauthReqInfo },
  });
});

app.post('/authorize', async (c) => {
  try {
    const formData = await c.req.raw.formData();
    validateCSRFToken(formData, c.req.raw);

    const encodedState = formData.get('state');
    if (!encodedState || typeof encodedState !== 'string') {
      return c.text('Missing state in form data', 400);
    }

    let state: { oauthReqInfo?: AuthRequest };
    try {
      state = JSON.parse(atob(encodedState));
    } catch {
      return c.text('Invalid state data', 400);
    }

    if (!state.oauthReqInfo?.clientId) {
      return c.text('Invalid request', 400);
    }

    const approvedClientCookie = await addApprovedClient(
      c.req.raw,
      state.oauthReqInfo.clientId,
      c.env.COOKIE_ENCRYPTION_KEY,
    );
    const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
    const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

    const headers = new Headers();
    headers.append('Set-Cookie', approvedClientCookie);
    headers.append('Set-Cookie', sessionBindingCookie);

    return redirectToGithub(c.env, c.req.raw, stateToken, Object.fromEntries(headers));
  } catch (error) {
    console.error('POST /authorize error', error);
    if (error instanceof OAuthError) {
      return error.toResponse();
    }
    return c.text('Internal server error', 500);
  }
});

async function redirectToGithub(
  bindings: AppBindings,
  request: Request,
  stateToken: string,
  headers: Record<string, string> = {},
) {
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        client_id: bindings.GITHUB_CLIENT_ID,
        redirect_uri: new URL('/callback', request.url).href,
        scope: 'read:user repo',
        state: stateToken,
        upstream_url: 'https://github.com/login/oauth/authorize',
      }),
    },
  });
}

app.get('/callback', async (c) => {
  let oauthReqInfo: AuthRequest;
  let clearSessionCookie: string;

  try {
    const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    oauthReqInfo = result.oauthReqInfo;
    clearSessionCookie = result.clearCookie;
  } catch (error) {
    if (error instanceof OAuthError) {
      return error.toResponse();
    }
    return c.text('Internal server error', 500);
  }

  if (!oauthReqInfo.clientId) {
    return c.text('Invalid OAuth request data', 400);
  }

  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: c.req.query('code'),
    redirect_uri: new URL('/callback', c.req.url).href,
    upstream_url: 'https://github.com/login/oauth/access_token',
  });
  if (errResponse) {
    return errResponse;
  }

  const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
  const { allowedGithubUsername } = getVaultConfig(c.env);
  if (user.data.login.toLowerCase() !== allowedGithubUsername.toLowerCase()) {
    return c.text('That GitHub account is not allowed to use this MCP server.', 403);
  }

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    metadata: {
      label: user.data.name ?? user.data.login,
    },
    props: {
      accessToken,
      login: user.data.login,
      name: user.data.name,
    } satisfies Props,
    request: oauthReqInfo,
    scope: oauthReqInfo.scope,
    userId: user.data.login,
  });

  const headers = new Headers({ Location: redirectTo });
  if (clearSessionCookie) {
    headers.set('Set-Cookie', clearSessionCookie);
  }

  return new Response(null, {
    status: 302,
    headers,
  });
});

export { app as GitHubHandler };
