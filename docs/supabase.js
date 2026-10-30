/* A small Supabase client over plain fetch.

   Supabase's own JS library would do this too, but pulling it from a CDN
   means pinning a version and hoping that version understands the new
   publishable keys. PostgREST, GoTrue and Storage are documented HTTP
   APIs and the surface this app needs is small, so it calls them directly.

   The publishable key below is meant to live in page source: it only
   identifies the project. What a caller may actually read or write is
   decided by the row-level security policies in supabase/schema.sql. */

const SUPABASE_URL = "https://tbgsphpxayapylmatfvw.supabase.co";
const SUPABASE_KEY = "sb_publishable_Kc-susxUYoZRmNRv15Ru9A_2TtDit-9";

const SESSION_KEY = "nda:session";
const BUCKET = "record-images";

const sb = (() => {
  let session = null;   // {access_token, refresh_token, expires_at}

  // localStorage can throw in a private window; the app must still load.
  function save(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* session lasts this page load only */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) { session = null; }
    return session;
  }

  function authHeader() {
    return "Bearer " + ((session && session.access_token) || SUPABASE_KEY);
  }

  function baseHeaders(extra) {
    return Object.assign({ apikey: SUPABASE_KEY, Authorization: authHeader() }, extra || {});
  }

  async function refresh() {
    if (!session || !session.refresh_token) return false;
    const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) { save(null); return false; }
    const body = await res.json();
    save({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + (body.expires_in || 3600) * 1000,
      user: body.user,
    });
    return true;
  }

  /* One retry on 401: an expired access token is the normal case, not an
     error worth showing the user. */
  async function request(path, opts) {
    opts = opts || {};
    const send = () => fetch(SUPABASE_URL + path, {
      method: opts.method || "GET",
      headers: baseHeaders(opts.headers),
      body: opts.body,
    });
    let res = await send();
    if (res.status === 401 && session) {
      if (await refresh()) res = await send();
    }
    return res;
  }

  async function json(path, opts) {
    const res = await request(path, opts);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const err = new Error((body && (body.message || body.error_description || body.error)) || ("HTTP " + res.status));
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  return {
    /* ---- session ---- */

    init() {
      load();
      // Expire a stale session up front so the UI does not flash as signed in.
      if (session && session.expires_at && session.expires_at < Date.now() - 60000) {
        // keep it: refresh() on the first call will try the refresh token
      }
      return session;
    },

    get session() { return session; },
    get signedIn() { return !!(session && session.access_token); },
    get email() { return (session && session.user && session.user.email) || ""; },
    get userId() { return (session && session.user && session.user.id) || null; },

    /* Capture the tokens GoTrue puts in the URL hash after a magic link.
       No PKCE challenge is sent with the sign-in request, so the implicit
       flow applies and the tokens arrive here rather than as a ?code. */
    async captureRedirect() {
      const hash = (location.hash || "").replace(/^#/, "");
      if (!hash || hash.indexOf("access_token=") === -1) return false;
      const p = new URLSearchParams(hash);
      save({
        access_token: p.get("access_token"),
        refresh_token: p.get("refresh_token"),
        expires_at: Date.now() + Number(p.get("expires_in") || 3600) * 1000,
      });
      history.replaceState("", document.title, location.pathname + location.search);
      try {
        const user = await json("/auth/v1/user");
        save(Object.assign({}, session, { user }));
      } catch (e) { save(null); return false; }
      return true;
    },

    async loadUser() {
      if (!session || !session.access_token) return null;
      if (session.user) return session.user;
      try {
        const user = await json("/auth/v1/user");
        save(Object.assign({}, session, { user }));
        return user;
      } catch (e) { save(null); return null; }
    },

    /* Magic link: no password to invent, and following the link is itself
       proof that the person holds the korea.ac.kr address. */
    async sendMagicLink(email, redirectTo) {
      const res = await fetch(
        SUPABASE_URL + "/auth/v1/otp?redirect_to=" + encodeURIComponent(redirectTo),
        {
          method: "POST",
          headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, create_user: true }),
        }
      );
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch (e) { /* empty body */ }
        const err = new Error((body && (body.msg || body.message || body.error_description)) || ("HTTP " + res.status));
        err.status = res.status;
        throw err;
      }
      return true;
    },

    async signOut() {
      try { await request("/auth/v1/logout", { method: "POST" }); } catch (e) { /* local sign-out anyway */ }
      save(null);
    },

    /* ---- data ---- */

    select(table, query) {
      return json("/rest/v1/" + table + (query ? "?" + query : ""));
    },

    async insert(table, row) {
      const rows = await json("/rest/v1/" + table, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    async upsert(table, row) {
      const rows = await json("/rest/v1/" + table, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(row),
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    async update(table, filter, patch) {
      const rows = await json("/rest/v1/" + table + "?" + filter, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    async remove(table, filter) {
      await json("/rest/v1/" + table + "?" + filter, { method: "DELETE" });
    },

    /* ---- images ---- */

    /* Paths are "<user id>/<uuid>.jpg"; the storage policies read that
       first segment to tell one person's uploads from another's. */
    async uploadImage(blob) {
      const uid = this.userId;
      if (!uid) throw new Error("로그인이 필요합니다.");
      const name = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      const path = uid + "/" + name + ".jpg";
      const res = await request("/storage/v1/object/" + BUCKET + "/" + path, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
        body: blob,
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch (e) { /* empty body */ }
        throw new Error((body && (body.message || body.error)) || ("업로드 실패 (HTTP " + res.status + ")"));
      }
      return path;
    },

    async deleteImage(path) {
      try { await request("/storage/v1/object/" + BUCKET + "/" + path, { method: "DELETE" }); }
      catch (e) { /* a missing object is not worth failing the save for */ }
    },

    imageUrl(path) {
      return SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + path;
    },
  };
})();
