// Cloudflare Pages Function: GitHub OAuth — callback.
//
// GitHub redirects here after the user authorizes the app. We exchange the
// short-lived `code` for a GitHub access token using our client_secret, then
// postMessage the token back to the Decap CMS window that opened us.
//
// Env vars (configure in Cloudflare Pages → Settings → Environment variables):
//   - GITHUB_CLIENT_ID
//   - GITHUB_CLIENT_SECRET (mark as encrypted/secret)

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.GITHUB_CLIENT_ID || !ctx.env.GITHUB_CLIENT_SECRET) {
    return new Response("Server misconfigured: GitHub OAuth env vars missing", {
      status: 500,
    });
  }

  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return renderResult("error", { error: "missing_code" });
  }

  // Exchange code → access token.
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: ctx.env.GITHUB_CLIENT_ID,
      client_secret: ctx.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = (await tokenRes.json()) as TokenResponse;

  if (data.error || !data.access_token) {
    return renderResult("error", {
      error: data.error_description ?? data.error ?? "exchange_failed",
    });
  }

  return renderResult("success", {
    token: data.access_token,
    provider: "github",
  });
};

// Render the popup-close page that postMessages back to the Decap opener.
// Decap protocol: `authorization:github:<status>:<payload-json>`
function renderResult(status: "success" | "error", payload: unknown) {
  const decapStatus = status === "success" ? "success" : "failure";
  const message = `authorization:github:${decapStatus}:${JSON.stringify(payload)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${status === "success" ? "Authorization complete" : "Authorization failed"}</title>
</head>
<body style="font-family: system-ui, sans-serif; padding: 2rem;">
  <p id="status">${status === "success" ? "Authorization complete. You can close this window." : "Authorization failed. You can close this window."}</p>
  <script>
    (function () {
      var MESSAGE = ${JSON.stringify(message)};
      function send() {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(MESSAGE, "*");
        }
      }
      // Decap sends "authorizing:github" to us; reply with the result when it does.
      window.addEventListener("message", function (e) {
        if (typeof e.data === "string" && e.data.indexOf("authorizing:github") === 0) {
          send();
        }
      });
      // Send once immediately in case Decap is already listening.
      send();
      // And once more after a short delay as belt-and-braces.
      setTimeout(send, 300);
      // Auto-close after a moment so the user doesn't have to.
      setTimeout(function () {
        try { window.close(); } catch (e) {}
      }, 1500);
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
