const PASS_SHA256 = "40cd20c5c5d343dad318e39218029fbd1f423c8a260f9bd3e11124082c82613e";
const COOKIE = "hwa_gate";

export const config = { runtime: "edge" };

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(buf);
}

function eq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function expectedHash() {
  const fromEnv = typeof process !== "undefined" && process.env && process.env.SITE_PASSWORD;
  if (fromEnv) return sha256hex(String(process.env.SITE_PASSWORD));
  return PASS_SHA256;
}

async function sessionToken() {
  return sha256hex("session:" + (await expectedHash()));
}

function cookieVal(request) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.match(/(?:^|;\s*)hwa_gate=([a-f0-9]+)/i);
  return m ? m[1] : "";
}

async function unlocked(request) {
  return eq(cookieVal(request), await sessionToken());
}

function loginPage(bad) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#07111f" />
  <title>Built For Life</title>
  <style>
    html,body{min-height:100%;margin:0;background:#07111f;color:#f6f7f9;font-family:system-ui,sans-serif}
    body{display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:360px;border:1px solid #1e4b8c;background:#0c1a2e;padding:22px 20px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
    .kicker{letter-spacing:.32em;text-transform:uppercase;font-size:12px;font-weight:800;color:#e10600;margin:0 0 8px}
    h1{margin:0 0 6px;font-size:28px;letter-spacing:.04em;text-transform:uppercase}
    p{margin:0 0 16px;color:#b8c5d6;font-size:14px}
    .err{color:#ffb4b4;margin-bottom:12px;font-size:13px}
    .hint{margin:8px 0 0;color:#8ea0b5;font-size:13px;font-style:italic}
    label{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:6px}
    input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #1e4b8c;background:#07111f;color:#fff;font-size:16px;border-radius:2px}
    button{width:100%;margin-top:14px;border:0;background:#c8102e;color:#fff;padding:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
    .bar{height:3px;margin:16px -20px -20px;background:repeating-linear-gradient(90deg,#f6f7f9 0 8px,#c8102e 8px 16px,#1e4b8c 16px 24px)}
  </style>
</head>
<body>
  <form class="card" method="post" action="/">
    <p class="kicker">3HWA · MAVERICK</p>
    <h1>Built For Life</h1>
    <p>Bonita Springs Estate. Enter the board password.</p>
    ${bad ? '<p class="err">Wrong password.</p>' : ""}
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
    <p class="hint">Hint: ants favorite snake plural capital T</p>
    <button type="submit">Unlock</button>
    <div class="bar"></div>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === "/logout") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const guess = String(form.get("password") || "");
    const ok = eq(await sha256hex(guess), await expectedHash());
    if (ok) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `${COOKIE}=${await sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
        },
      });
    }
    return loginPage(true);
  }

  if (await unlocked(request)) return;
  return loginPage(url.searchParams.has("bad"));
}
