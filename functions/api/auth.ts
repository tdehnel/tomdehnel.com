// Cloudflare Pages Function: GitHub OAuth — kick-off.
//
// Decap CMS opens a popup to this URL when the user clicks "Login with GitHub".
// We redirect to GitHub's OAuth authorize endpoint with the client_id (public),
// scope (the repo scope grants commit access), and a callback URL pointing at
// /api/callback (configured on the GitHub OAuth App side).
//
// Env vars (configure in Cloudflare Pages → Settings → Environment variables):
//   - GITHUB_CLIENT_ID

interface Env {
  GITHUB_CLIENT_ID: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.GITHUB_CLIENT_ID) {
    return new Response("Server misconfigured: GITHUB_CLIENT_ID is not set", { status: 500 });
  }

  const url = new URL(ctx.request.url);
  const provider = url.searchParams.get("provider") ?? "github";
  if (provider !== "github") {
    return new Response(`Unsupported provider: ${provider}`, { status: 400 });
  }
  const scope = url.searchParams.get("scope") ?? "repo,user";

  const callbackUrl = `${url.origin}/api/callback`;

  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", ctx.env.GITHUB_CLIENT_ID);
  gh.searchParams.set("scope", scope);
  gh.searchParams.set("redirect_uri", callbackUrl);

  return Response.redirect(gh.toString(), 302);
};
