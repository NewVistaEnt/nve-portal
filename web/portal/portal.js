// Client portal: signs the client in by email, then shows their one project.
(function () {
  var $ = NV.$, $$ = NV.$$, esc = NV.esc, app = $("#app");
  var params = new URLSearchParams(location.search);
  var portalId = params.get("p") || "";
  var D = null, tab = "overview";

  var ICON = {
    mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    pay: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
    cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  };

  async function start() {
    var s = await NV.session({
      el: app, photo: true,
      title: "Your New Vista project",
      text: "Enter the email New Vista has for you. We'll send a link that signs you straight in.",
      expiredTitle: "Welcome back",
      expiredText: "It's been a while since you last signed in. For your safety, enter your email and we'll send you a fresh link.",
    });
    if (!s) return;
    app.innerHTML = '<p class="loading">Loading your project…</p>';
    try {
      D = await NV.fn("portal-data", { portal_id: portalId || undefined });
      if (!portalId && D.portal) history.replaceState(null, "", "?p=" + D.portal.id + location.hash);
      portalId = D.portal.id;
      render();
    } catch (e) {
      app.innerHTML = '<div class="signin photo"><div class="wrap" style="width:100%;display:grid;place-items:center"><div class="sbox"><img class="logo" src="../assets/logo/nv-horizontal.svg" alt="New Vista Enterprises"><h1>We couldn\'t open your project</h1><p>' + esc(e.message) + '</p><button class="btn go" type="button" id="out">Sign in with a different email</button></div></div></div>';
      $("#out").addEventListener("click", async function () { await NV.sb.auth.signOut(); location.reload(); });
    }
  }

  // ---------- pieces ----------
  function nextUp() {
    var s = (D.schedule || []).filter(function (x) { return !x.completed; })[0];
    if (!s) return null;
    var v = (s.visits || []).filter(function (d) { return new Date(d) >= new Date(new Date().toDateString()); })[0] || s.start;
    return { title: s.service, when: v, scheduled: s.scheduled };
  }
  function due() { return (D.invoices || []).filter(function (i) { return !i.hidden; }).reduce(function (a, i) { return a + (Number(i.remaining) || 0); }, 0); }
  function on(k) { return D.portal.sections[k] !== false; }

  function render() {
    var p = D.portal, c = D.contact, first = c ? c.name.split(" ")[0] : "us";
    var nx = on("schedule") ? nextUp() : null, owe = on("payments") ? due() : 0;
    var tabs = [["overview", "Overview"]];
    if (on("schedule")) tabs.push(["schedule", "Schedule"]);
    if (on("updates")) tabs.push(["updates", "Updates", D.updates.length]);
    if (on("photos")) tabs.push(["photos", "Photos"]);
    if (on("payments")) tabs.push(["payments", "Payments"]);
    if (on("documents")) tabs.push(["documents", "Documents"]);
    if (on("team")) tabs.push(["team", "Team"]);
    var hashTab = location.hash.slice(1);
    if (tabs.some(function (t) { return t[0] === hashTab; })) tab = hashTab;

    var me = (D.people || [])[0];
    app.innerHTML =
      (D.preview ? '<div class="preview"><div class="wrap"><b>Preview</b> This is exactly what the client sees. Items marked “Hidden from client” are only shown to you.</div></div>' : "") +
      '<header class="top"><div class="wrap"><img src="../assets/logo/nv-horizontal-reverse.svg" alt="New Vista Enterprises"><span class="ttl">My New Vista</span>' +
      '<div class="right">' +
      (D.portals.length > 1 ? '<select class="switch" id="switch" aria-label="Your projects">' + D.portals.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>" : "") +
      (me && !D.preview ? '<span class="nm">' + esc(me.name) + "</span>" : "") +
      '<button type="button" id="signout">Sign out</button></div></div></header>' +

      '<section class="hero ' + (p.cover ? "" : "plain") + '"><div class="ph"' + (p.cover ? ' style="background-image:url(\'' + esc(p.cover) + '\')"' : "") + "></div>" +
      (p.cover ? "" : '<img class="mark" src="../assets/logo/nv-mark.svg" alt="">') +
      '<div class="wrap"><div class="where">' + esc([p.address, p.city].filter(Boolean).join(" · ")) + "</div>" +
      "<h1>" + esc(p.headline || p.project_name) + "</h1>" +
      (p.headline ? '<p class="sub">' + esc(p.project_name) + "</p>" : "") +
      '<div class="status">' +
      (on("schedule") ? '<div><div class="k">Next up</div><div class="v">' + (nx ? esc(nx.title) + "<small>" + (nx.when ? (nx.scheduled ? "" : "Planned ") + esc(NV.date(nx.when, { weekday: "short", month: "short", day: "numeric" })) : "Date to be set") + "</small>" : "All caught up<small>We'll post the next step here</small>") + "</div></div>" : "") +
      (on("payments") ? '<div><div class="k">Balance due</div><div class="v num">' + NV.money(owe) + "<small>" + (owe > 0 ? "Pay in the billing portal" : "Nothing due right now") + "</small></div></div>" : "") +
      (c ? '<div><div class="k">Your contact</div><div class="v">' + esc(c.name) + "<small>" + esc(c.title || "New Vista") + "</small></div></div>" : "") +
      "</div></div></section>" +

      '<nav class="ptabs" aria-label="Project sections"><div class="wrap"><div class="scroll" role="tablist">' +
      tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + (t[2] ? '<span class="c">' + t[2] + "</span>" : "") + "</button>"; }).join("") +
      '</div><button class="mailtab" type="button" id="mailtab" aria-label="Message ' + esc(first) + '" title="Message ' + esc(first) + '">' + ICON.mail + "</button></div></nav>" +

      '<main class="wrap pmain">' + (D.problems && D.problems.length ? '<div class="soft">Some details (' + esc(D.problems.join(", ")) + ") couldn't load just now. Try again in a few minutes.</div>" : "") +
      '<div class="cols"><div class="stack" id="view"></div><aside class="stack">' + contactCard() + "</aside></div></main>" +
      '<footer class="wrap foot">New Vista Enterprises · Family owned since 2000</footer>';

    $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); $$("[data-tab]").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); view(); }); });
    $("#mailtab").addEventListener("click", function () { var m = $("#msgcard"); m.scrollIntoView({ behavior: "smooth", block: "center" }); m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash"); setTimeout(function () { $("#msg").focus({ preventScroll: true }); }, 500); });
    $("#signout").addEventListener("click", async function () { await NV.sb.auth.signOut(); location.href = location.pathname; });
    var sw = $("#switch"); if (sw) sw.addEventListener("change", function () { location.href = "?p=" + sw.value; });
    wireMessage();
    view();
  }

  function contactCard() {
    var c = D.contact; if (!c) return "";
    var first = c.name.split(" ")[0];
    return '<div class="card" id="msgcard"><div class="contactcard">' + NV.avatar(c) + "<div><b>" + esc(c.name) + '</b><div class="role">' + esc(c.title || "Your contact") + '</div><div class="ct">' + esc(c.email || "") + (c.phone ? "<br>" + esc(c.phone) : "") + "</div></div></div>" +
      '<form class="msgbox" id="msgform"><label class="lab" for="msg" style="display:block;margin-bottom:8px">Message ' + esc(first) + '</label><textarea id="msg" maxlength="4000" placeholder="Questions, a change, a gate code… ' + esc(first) + ' will reply by email."></textarea>' +
      '<div class="row"><button class="btn warm" type="submit">Send</button><span>' + (NV.config.officePhone ? "Urgent? Call " + esc(NV.config.officePhone) : "Replies come to your email") + "</span></div></form></div>";
  }
  function wireMessage() {
    var f = $("#msgform"); if (!f) return;
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var t = $("#msg").value.trim(); if (!t) return;
      if (D.preview) { NV.toast("Preview only. Clients send messages from here."); return; }
      var b = $("button", f); b.disabled = true; b.textContent = "Sending…";
      try { var r = await NV.fn("message-contact", { portal_id: D.portal.id, body: t }); $("#msg").value = ""; NV.toast("Sent. " + (r.to || "We") + " will reply by email."); }
      catch (err) { NV.toast(err.message); }
      finally { b.disabled = false; b.textContent = "Send"; }
    });
  }

  function hid(x) { return x.hidden ? " hiddenitem" : ""; }

  // ---------- views ----------
  function view() {
    var v = $("#view");
    v.innerHTML = ({ overview: overview, schedule: schedule, updates: updates, photos: photos, payments: payments, documents: documents, team: team }[tab] || overview)();
    $$("[data-doc]", v).forEach(function (b) { b.addEventListener("click", function () { download(Number(b.dataset.doc), b); }); });
    $$("[data-go]", v).forEach(function (b) { b.addEventListener("click", function () { var t = $('[data-tab="' + b.dataset.go + '"]'); if (t) t.click(); window.scrollTo({ top: $(".ptabs").offsetTop, behavior: "smooth" }); }); });
  }

  function overview() {
    var first = (D.people[0] && D.people[0].name.split(" ")[0]) || "";
    var items = [], owe = on("payments") ? due() : 0, nx = on("schedule") ? nextUp() : null;
    if (owe > 0) items.push('<div class="need"><span class="ic pay">' + ICON.pay + "</span><div><b>" + NV.money(owe) + ' is due</b><span class="s">Payments are handled securely in our billing portal.</span><div class="act">' + (D.billing_url ? '<a class="btn warm small" href="' + esc(D.billing_url) + '" target="_blank" rel="noopener">Pay now</a>' : "") + '<button class="btn small" type="button" data-go="payments">See invoices</button></div></div></div>');
    if (nx) items.push('<div class="need"><span class="ic cal">' + ICON.cal + "</span><div><b>" + esc(nx.title) + '</b><span class="s">' + (nx.when ? (nx.scheduled ? "Scheduled for " : "Planned for ") + esc(NV.date(nx.when, { weekday: "long", month: "long", day: "numeric" })) : "We'll set a date soon") + "</span></div></div>");
    if (!items.length) items.push('<div class="need"><span class="ic ok">' + ICON.ok + '</span><div><b>Nothing needed from you right now</b><span class="s">We\'ll let you know here when something comes up.</span></div></div>');
    var latest = on("updates") ? D.updates.slice(0, 2) : [];
    return '<div class="vh"><h2>' + (first ? "Hi " + esc(first) + "." : "Welcome.") + "</h2><p>Here's where your project stands. Everything on this page updates on its own as the work moves along.</p></div>" +
      '<div class="card"><div class="cardh"><h3>What\'s next</h3></div>' + items.join("") + "</div>" +
      (latest.length ? '<div class="card"><div class="cardh"><h3>Latest from the crew</h3><button class="btn small" type="button" data-go="updates">All updates</button></div>' + latest.map(post).join("") + "</div>" : "");
  }

  function schedule() {
    var s = D.schedule || [];
    if (!s.length) return '<div class="vh"><h2>Schedule</h2></div><div class="card"><p class="empty">Your schedule will appear here once dates are set.</p></div>';
    var firstOpen = s.findIndex(function (x) { return !x.completed; });
    return '<div class="vh"><h2>Schedule</h2><p>Dates come straight from our crew schedule, so they stay current. Weather can move things a day or two.</p></div>' +
      '<div class="card"><div class="cardb"><ol class="tl">' + s.map(function (x, i) {
        var cls = x.completed ? "d" : i === firstOpen ? "n" : "u";
        var d = x.completed ? "Done " + NV.date(x.completed) : x.start ? (x.scheduled ? "" : "Planned ") + NV.date(x.start, { month: "short", day: "numeric" }) : "To be set";
        var visits = (x.visits || []).length > 1 && !x.completed ? (x.visits.length + " crew days") : "";
        return '<li class="' + cls + '"><span class="dot"></span><div><div class="tt">' + esc(x.service) + (cls === "n" ? ' <span class="pill now">Up next</span>' : "") + "</div>" + (visits ? '<div class="td">' + visits + "</div>" : "") + '</div><div class="dt">' + esc(d) + "</div></li>";
      }).join("") + "</ol></div></div>";
  }

  function post(u) {
    var a = u.author || { name: "New Vista" };
    return '<article class="post">' + NV.avatar(a) + '<div><div class="who"><b>' + esc(a.name) + "</b>" + (a.title ? '<span class="r">' + esc(a.title) + "</span>" : "") + '<span class="t">' + esc(NV.when(u.at)) + '</span></div><p class="tx">' + esc(u.body) + "</p>" +
      (u.photos && u.photos.length ? '<div class="thumbs">' + u.photos.map(function (src) { return '<a href="' + esc(src) + '" target="_blank" rel="noopener" style="background-image:url(\'' + esc(src) + '\')" aria-label="Open photo"></a>'; }).join("") + "</div>" : "") + "</div></article>";
  }
  function updates() {
    return '<div class="vh"><h2>Updates</h2><p>Notes and photos from the people working on your project.</p></div>' +
      '<div class="card">' + (D.updates.length ? D.updates.map(post).join("") : '<p class="empty">No updates yet. The crew will post here as work gets going.</p>') + "</div>";
  }

  function photos() {
    var ph = D.photos || [];
    return '<div class="vh"><h2>Photos</h2><p>Progress photos from the job site.</p></div>' +
      (ph.length ? '<div class="gal">' + ph.map(function (x) { return '<figure class="' + hid(x) + '"><a href="' + esc(x.web) + '" target="_blank" rel="noopener" style="background-image:url(\'' + esc(x.thumb || x.web) + '\')" aria-label="Open photo"></a>' + (x.caption || x.at ? "<figcaption>" + esc(x.caption || NV.date(x.at)) + "</figcaption>" : "") + "</figure>"; }).join("") + "</div>"
        : '<div class="card"><p class="empty">Photos will appear here as the crew takes them.</p></div>');
  }

  function payments() {
    var inv = D.invoices || [], vis = inv.filter(function (i) { return !i.hidden; });
    var total = vis.reduce(function (a, i) { return a + (Number(i.amount) || 0); }, 0), owe = due();
    return '<div class="vh"><h2>Payments</h2><p>Every invoice for this project. To pay, use our secure billing portal.</p></div>' +
      '<div class="money"><div><div class="lab">Invoiced</div><div class="v num">' + NV.money(total) + '</div></div><div><div class="lab">Paid</div><div class="v num">' + NV.money(total - owe) + '</div></div><div><div class="lab">Balance due</div><div class="v num ' + (owe > 0 ? "due" : "") + '">' + NV.money(owe) + "</div></div></div>" +
      (D.billing_url ? '<div class="paynote"><p>Payments, receipts and saved cards live in our billing portal, the same one you may have used before.</p><a class="btn" href="' + esc(D.billing_url) + '" target="_blank" rel="noopener">Open billing portal ↗</a></div>' : "") +
      '<div class="card">' + (inv.length ? '<div class="tw"><table class="pt"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="r">Amount</th><th class="r">Status</th></tr></thead><tbody>' +
        inv.map(function (i) { var paid = !(Number(i.remaining) > 0); return '<tr class="' + hid(i) + '"><td class="num">#' + esc(i.number) + '</td><td>' + esc(NV.date(i.date)) + "</td><td>" + esc(NV.date(i.due) || "On receipt") + '</td><td class="r num">' + NV.money(i.amount) + '</td><td class="r">' + (paid ? '<span class="pill ok">Paid</span>' : '<span class="pill due">' + NV.money(i.remaining) + " due</span>") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="empty">No invoices yet.</p>') + "</div>";
  }

  function documents() {
    var d = D.documents || [];
    return '<div class="vh"><h2>Documents</h2><p>Contracts, drawings and anything else we\'ve shared with you.</p></div>' +
      '<div class="card">' + (d.length ? d.map(function (x) { return '<div class="doc' + hid(x) + '"><span class="fi">' + esc((x.ext || "file").replace(".", "").slice(0, 4)) + "</span><div><b>" + esc(x.name) + '</b><span class="s">Added ' + esc(NV.date(x.date)) + '</span></div><button class="btn small" type="button" data-doc="' + x.id + '">Download</button></div>'; }).join("")
        : '<p class="empty">Nothing here yet.</p>') + "</div>";
  }

  function team() {
    var t = (D.team || []).filter(Boolean);
    return '<div class="vh"><h2>Your team</h2><p>The people working on your project. For anything you need, message ' + esc(D.contact ? D.contact.name.split(" ")[0] : "us") + ".</p></div>" +
      (t.length ? '<div class="mates2">' + t.map(function (m) { return '<div class="card mate2">' + NV.avatar(m) + "<div><b>" + esc(m.name) + '</b><span class="s">' + esc(m.title || "") + "</span></div></div>"; }).join("") + "</div>"
        : '<div class="card"><p class="empty">Your team will be listed here.</p></div>');
  }

  async function download(id, btn) {
    btn.disabled = true; btn.textContent = "Getting it…";
    try {
      var r = await NV.fn("portal-data", { portal_id: D.portal.id, action: "file", attachment_id: id });
      var bin = atob(r.data), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr]));
      var a = document.createElement("a"); a.href = url; a.download = r.name || "document"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { NV.toast(e.message); }
    finally { btn.disabled = false; btn.textContent = "Download"; }
  }

  start();
})();
