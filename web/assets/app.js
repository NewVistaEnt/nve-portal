// Shared helpers for every page. Needs config.js and supabase-js loaded first.
(function () {
  var C = window.NV_CONFIG;
  var ROOT = (document.currentScript && document.currentScript.src || "").replace(/assets\/app\.js.*$/, "");
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var toastEl, tt;
  function toast(m) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = m; toastEl.hidden = false; clearTimeout(tt); tt = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  // Call one of our server functions.
  async function fn(name, body, headers) {
    var s = (await sb.auth.getSession()).data.session;
    var h = Object.assign({ apikey: C.supabaseAnonKey, "Content-Type": "application/json", Authorization: "Bearer " + (s ? s.access_token : C.supabaseAnonKey) }, headers || {});
    var r = await fetch(C.supabaseUrl + "/functions/v1/" + name, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    var j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { var err = new Error(j.error || "Something went wrong. Please try again."); err.status = r.status; throw err; }
    return j;
  }

  function initials(name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function avatar(p, cls) {
    if (!p) return "";
    var style = p.photo ? "background-image:url('" + esc(p.photo) + "')" : "background-color:" + esc(p.color || "#2C6E70");
    return '<span class="pav ' + (cls || "") + '" style="' + style + '" aria-hidden="true">' + (p.photo ? "" : esc(initials(p.name))) + "</span>";
  }
  function date(d, opts) { if (!d) return ""; var x = new Date(d); if (isNaN(x)) return ""; return x.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: x.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }); }
  function when(d) {
    var x = new Date(d), s = (Date.now() - x) / 1000;
    if (s < 60) return "Just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " hr ago";
    if (s < 172800) return "Yesterday"; return date(d);
  }
  function money(n) { return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }); }

  // Read a sign-in problem from the link (e.g. an expired email link).
  function linkProblem() {
    var h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
    var code = h.get("error_code") || q.get("error_code");
    if (!code && !h.get("error")) return null;
    history.replaceState(null, "", location.pathname + location.search.replace(/[?&]error[^&]*/g, ""));
    return code || h.get("error");
  }

  // Email-only sign in: we email a link and a 6-digit code. No passwords.
  // o: { el, title, text, expiredTitle, expiredText, photo, logo }
  function signIn(o) {
    return new Promise(function (resolve) {
      var problem = linkProblem();
      var expired = problem && /expired|invalid|otp/i.test(problem);
      var el = o.el;
      el.innerHTML =
        '<div class="signin ' + (o.photo ? "photo" : "") + '"><div class="wrap" style="width:100%;display:grid;place-items:center">' +
        '<form class="sbox" novalidate>' +
        '<img class="logo" src="' + ROOT + 'assets/logo/' + (matchMedia("(prefers-color-scheme: dark)").matches ? "nv-horizontal-reverse.svg" : "nv-horizontal.svg") + '" alt="New Vista Enterprises">' +
        "<h1>" + esc(expired ? (o.expiredTitle || "That link has expired") : o.title) + "</h1>" +
        "<p>" + esc(expired ? (o.expiredText || "For your safety, sign-in links only work for a short time. Enter your email and we'll send a fresh one.") : o.text) + "</p>" +
        '<div class="fld"><label for="si-email">Email</label><input id="si-email" type="email" inputmode="email" autocomplete="email" required></div>' +
        '<button class="btn warm" type="submit">Email me a sign-in link</button>' +
        '<div class="step2" hidden><div class="ok">Check your email. Tap the link in it, or type the 6-digit code here.</div>' +
        '<div class="fld"><label for="si-code">Code</label><input id="si-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></div>' +
        '<button class="btn go" type="button" data-verify>Sign in</button><button class="btn quiet" type="button" data-again>Use a different email</button></div>' +
        '<div class="bad" hidden role="alert"></div>' +
        "</form></div></div>";
      var f = $("form", el), email = $("#si-email", el), bad = $(".bad", el), step2 = $(".step2", el), send = $('button[type="submit"]', el);
      try { email.value = localStorage.getItem("nv-email") || ""; } catch (e) { /* storage off */ }
      function err(m) { bad.textContent = m; bad.hidden = !m; }
      f.addEventListener("submit", async function (e) {
        e.preventDefault(); err("");
        var v = email.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return err("Please enter your email address.");
        send.disabled = true; send.textContent = "Sending…";
        var redirect = location.origin + location.pathname + location.search;
        var r = await sb.auth.signInWithOtp({ email: v, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
        send.disabled = false; send.textContent = "Email me a sign-in link";
        if (r.error) {
          if (/signup|not allowed|not found/i.test(r.error.message)) return err("We don't have that email on file. Please use the email New Vista has for you, or call the office.");
          if (/rate|seconds/i.test(r.error.message)) return err("We just sent one. Please wait a minute and try again.");
          return err(r.error.message);
        }
        try { localStorage.setItem("nv-email", v); } catch (e2) { /* storage off */ }
        send.hidden = true; email.disabled = true; step2.hidden = false; $("#si-code", el).focus();
      });
      $("[data-verify]", el).addEventListener("click", async function () {
        err("");
        var code = $("#si-code", el).value.replace(/\D/g, "");
        if (code.length !== 6) return err("The code is 6 numbers.");
        var r = await sb.auth.verifyOtp({ email: email.value.trim().toLowerCase(), token: code, type: "email" });
        if (r.error) return err("That code didn't work. Check the newest email, or send a new one.");
        resolve(r.data.session);
      });
      $("[data-again]", el).addEventListener("click", function () { step2.hidden = true; send.hidden = false; email.disabled = false; email.focus(); });
      sb.auth.onAuthStateChange(function (ev, session) { if (session && ev === "SIGNED_IN") resolve(session); });
    });
  }

  // Resolve with a session: existing, from the link just clicked, or after signing in.
  async function session(o) {
    var s = (await sb.auth.getSession()).data.session;
    if (s) return s;
    return signIn(o);
  }

  window.NV = { sb: sb, fn: fn, $: $, $$: $$, esc: esc, toast: toast, avatar: avatar, initials: initials, date: date, when: when, money: money, session: session, root: ROOT, config: C };
})();
