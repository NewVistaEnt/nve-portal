// Admin: New Leads, Client Portals, Team, Settings. For Jana and other admins.
(function () {
  var $ = NV.$, $$ = NV.$$, esc = NV.esc, sb = NV.sb, app = $("#app");
  var me = null, staff = [], counts = { leads: 0, portals: 0 };
  var COVERS = ["patio.jpg", "hearth.jpg", "garden.jpg"];
  var SECTIONS = [
    ["schedule", "Schedule", "Dates from Aspire work tickets"],
    ["updates", "Updates", "Notes and photos the team posts"],
    ["photos", "Photos", "CompanyCam photos tagged “Client”"],
    ["payments", "Payments", "Invoices and balance from Aspire"],
    ["documents", "Documents", "Aspire files marked “Show customer”"],
    ["team", "Team", "Teammates on this project"],
  ];

  async function start() {
    await NV.session({ el: app, title: "New Vista admin", text: "Enter your work email and we'll send you a sign-in link." });
    var email = (await sb.auth.getUser()).data.user.email.toLowerCase();
    me = (await sb.from("staff").select("*").ilike("email", email).eq("active", true).maybeSingle()).data;
    if (!me || me.role !== "admin") {
      app.innerHTML = '<div class="wrap narrow" style="padding-block:60px"><div class="card cardb"><h2>This page is for admins</h2><p style="margin-top:8px;color:var(--dim)">' + (me ? 'To post an update, use the <a href="../post/">team page</a>.' : esc(email) + " isn't on the team list.") + '</p><p style="margin-top:14px"><button class="btn" id="out">Sign out</button></p></div></div>';
      $("#out").onclick = signOut; return;
    }
    await loadStaff();
    shell();
    window.addEventListener("hashchange", route);
    route();
  }
  async function signOut() { await sb.auth.signOut(); location.href = location.pathname; }
  async function loadStaff() { staff = (await sb.from("staff").select("*").order("name")).data || []; }
  async function refreshCounts() {
    var a = await sb.from("leads").select("id", { count: "exact", head: true }).eq("status", "new");
    var b = await sb.from("portals").select("id", { count: "exact", head: true }).eq("status", "pending");
    counts.leads = a.count || 0; counts.portals = b.count || 0;
    var l = $('[data-nav="leads"] .bub'), p = $('[data-nav="portals"] .bub');
    if (l) { l.textContent = counts.leads; l.hidden = !counts.leads; }
    if (p) { p.textContent = counts.portals; p.hidden = !counts.portals; }
  }

  function shell() {
    app.innerHTML =
      '<header class="top"><div class="wrap" style="max-width:none"><img src="../assets/logo/nv-horizontal-reverse.svg" alt="New Vista Enterprises"><span class="ttl">Admin</span><div class="right"><span class="nm">' + esc(me.name) + '</span><button type="button" id="out">Sign out</button></div></div></header>' +
      '<div class="shell"><nav class="side" aria-label="Admin">' +
      '<a href="#leads" data-nav="leads">New Leads <span class="bub" hidden></span></a>' +
      '<a href="#portals" data-nav="portals">Client Portals <span class="bub" hidden></span></a>' +
      '<a href="#team" data-nav="team">Team</a>' +
      '<a href="#settings" data-nav="settings">Settings</a>' +
      '<a href="../post/" target="_blank" rel="noopener">Post an update ↗</a>' +
      '</nav><main class="main" id="main"></main></div>';
    $("#out").onclick = signOut;
    refreshCounts();
  }

  function route() {
    var h = location.hash.slice(1) || "leads", parts = h.split("/");
    $$("[data-nav]").forEach(function (a) { a.setAttribute("aria-current", a.dataset.nav === parts[0] ? "page" : "false"); });
    var m = $("#main"); m.innerHTML = '<p class="loading">Loading…</p>';
    if (parts[0] === "portal" && parts[1]) return portalSetup(parts[1]);
    ({ leads: leads, portals: portals, team: team, settings: settings }[parts[0]] || leads)();
    window.scrollTo(0, 0);
  }

  // ========================= NEW LEADS =========================
  var leadFilter = "new", leadSel = null;
  async function leads() {
    var q = sb.from("leads").select("*").order("created_at", { ascending: false }).limit(200);
    if (leadFilter !== "all") q = q.eq("status", leadFilter);
    var rows = (await q).data || [];
    var m = $("#main");
    m.innerHTML = '<div class="ph"><div><h1>New Leads</h1><p>Sent in by the team. Add each one to Aspire, then mark it entered. Only admins can see this page.</p></div>' +
      '<a class="btn" href="../lead/" target="_blank" rel="noopener">Open the lead form ↗</a></div>' +
      '<div class="filters">' + [["new", "To enter"], ["entered", "Entered"], ["archived", "Archived"], ["all", "All"]].map(function (f) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (leadFilter === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div>" +
      '<div class="card list">' + (rows.length ? rows.map(function (l) {
        var name = l.kind === "Commercial" ? l.property_name : (l.first_name + " " + l.last_name);
        return '<div class="row" role="button" tabindex="0" data-id="' + l.id + '" aria-current="' + (leadSel === l.id) + '"><div><b>' + esc(name) + '</b><span class="s">' + esc(l.brand) + " · " + esc(l.kind) + " · from " + esc(l.submitted_by) + '</span></div><div class="meta">' + pillFor(l.status) + "<span>" + esc(NV.when(l.created_at)) + "</span></div></div>";
      }).join("") : '<p class="empty">Nothing here. You\'re caught up.</p>') + "</div>" +
      '<div id="leaddetail"></div>';
    $$("[data-f]", m).forEach(function (b) { b.onclick = function () { leadFilter = b.dataset.f; leadSel = null; leads(); }; });
    $$(".row", m).forEach(function (r) {
      var open = function () { leadSel = Number(r.dataset.id); $$(".row", m).forEach(function (x) { x.setAttribute("aria-current", x === r); }); leadDetail(rows.find(function (x) { return x.id === leadSel; })); };
      r.onclick = open; r.onkeydown = function (e) { if (e.key === "Enter") open(); };
    });
    if (leadSel) { var cur = rows.find(function (x) { return x.id === leadSel; }); if (cur) leadDetail(cur); }
    refreshCounts();
  }
  function pillFor(s) { return s === "new" ? '<span class="pill new">To enter</span>' : s === "entered" ? '<span class="pill ok">In Aspire</span>' : '<span class="pill gray">Archived</span>'; }

  function leadDetail(l) {
    var box = $("#leaddetail"); if (!l) { box.innerHTML = ""; return; }
    var name = l.kind === "Commercial" ? l.property_name : (l.first_name + " " + l.last_name);
    var more = (l.extra_contacts || []).map(function (c) { return "<dt>" + esc(c.role || "Also") + "</dt><dd>" + esc(c.name) + (c.email ? "<br>" + esc(c.email) : "") + (c.phone ? "<br>" + esc(c.phone) : "") + "</dd>"; }).join("");
    box.innerHTML = '<div class="card detail"><div class="cardh"><h2>' + esc(name) + ' <span class="pill gray">' + esc(l.brand) + '</span></h2><span style="color:var(--dim);font-size:13.5px">#' + l.id + " · from " + esc(l.submitted_by) + " · " + esc(new Date(l.created_at).toLocaleString()) + "</span></div>" +
      '<div class="kvs"><div><h3>Aspire property</h3><dl class="kv">' +
      (l.kind === "Commercial" ? "<dt>Property name</dt><dd>" + esc(l.property_name) + "</dd>" : "<dt>First name</dt><dd>" + esc(l.first_name) + "</dd><dt>Last name</dt><dd>" + esc(l.last_name) + "</dd>") +
      "<dt>Type</dt><dd>" + esc(l.kind) + "</dd><dt>Brand</dt><dd>" + esc(l.brand) + "</dd><dt>Account owner</dt><dd>" + esc(l.account_owner) + "</dd><dt>Lead source</dt><dd>" + esc(l.lead_source) + "</dd><dt>Address</dt><dd>" + esc(l.property_address) + "</dd><dt>Billing address</dt><dd>" + esc(l.billing_same ? "Same as property" : l.billing_address) + "</dd><dt>Paperless</dt><dd>" + (l.paperless ? "Yes" : "No") + "</dd></dl></div>" +
      '<div><h3>Aspire contact</h3><dl class="kv"><dt>Primary</dt><dd>' + esc(l.contact_name) + "</dd><dt>Phone</dt><dd>" + esc(l.contact_phone) + "</dd><dt>Email</dt><dd>" + esc(l.contact_email) + "</dd><dt>Billing contact</dt><dd>" + (l.billing_contact_same ? "Same as primary" : esc(l.billing_contact_name) + "<br>" + esc(l.billing_contact_email)) + "</dd>" + more + "</dl></div></div>" +
      (l.notes ? '<div class="said"><div class="lab" style="margin-bottom:6px">What they said</div><p style="white-space:pre-wrap">' + esc(l.notes) + "</p></div>" : "") +
      '<div class="acts">' + (l.status === "new" ? '<button class="btn go" type="button" data-a="entered">Mark as entered in Aspire</button>' : '<span style="color:var(--dim);font-size:13.5px">' + (l.entered_by ? "Entered by " + esc(l.entered_by) + " · " + esc(NV.date(l.entered_at)) : "") + '</span><button class="btn small" type="button" data-a="new">Move back to To enter</button>') +
      '<button class="btn small" type="button" id="copy">Copy all</button>' + (l.status !== "archived" ? '<button class="btn quiet small" type="button" data-a="archived">Archive</button>' : "") + "</div></div>";
    $$("[data-a]", box).forEach(function (b) {
      b.onclick = async function () {
        var s = b.dataset.a, patch = { status: s };
        if (s === "entered") { patch.entered_by = me.name; patch.entered_at = new Date().toISOString(); }
        var r = await sb.from("leads").update(patch).eq("id", l.id);
        if (r.error) return NV.toast("Couldn't save that.");
        NV.toast(s === "entered" ? "Marked as entered." : s === "archived" ? "Archived." : "Moved back.");
        leads();
      };
    });
    $("#copy").onclick = function () {
      var t = [
        l.kind === "Commercial" ? "Property: " + l.property_name : "Name: " + l.first_name + " " + l.last_name,
        "Type: " + l.kind, "Brand: " + l.brand, "Account owner: " + l.account_owner, "Lead source: " + l.lead_source,
        "Address: " + l.property_address, "Billing address: " + (l.billing_same ? "Same as property" : l.billing_address),
        "Contact: " + l.contact_name, "Phone: " + l.contact_phone, "Email: " + l.contact_email,
        "Billing contact: " + (l.billing_contact_same ? "Same as primary" : l.billing_contact_name + " " + l.billing_contact_email),
        "Paperless: " + (l.paperless ? "Yes" : "No"),
      ].concat((l.extra_contacts || []).map(function (c) { return (c.role || "Also") + ": " + [c.name, c.email, c.phone].filter(Boolean).join(", "); }))
        .concat(l.notes ? ["Notes: " + l.notes] : []).join("\n");
      navigator.clipboard.writeText(t).then(function () { NV.toast("Copied. Paste into Aspire."); }, function () { NV.toast("Copy didn't work in this browser."); });
    };
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ========================= PORTALS =========================
  var portalFilter = "pending";
  async function portals() {
    var q = sb.from("portals").select("id,project_name,property_address,property_city,status,won_date,needs_attention,invited_at,sales_rep,portal_people(name,email,last_seen_at)").order("created_at", { ascending: false }).limit(200);
    if (portalFilter === "closed") q = q.in("status", ["archived", "skipped"]); else q = q.eq("status", portalFilter);
    var rows = (await q).data || [];
    var m = $("#main");
    m.innerHTML = '<div class="ph"><div><h1>Client Portals</h1><p>When a New Vista job is marked Won in Aspire, a portal shows up here. Check it, then press Approve &amp; send.</p></div>' +
      '<button class="btn" type="button" id="check">Check Aspire now</button></div>' +
      '<div class="filters">' + [["pending", "To review"], ["invited", "Live"], ["closed", "Archived"]].map(function (f) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (portalFilter === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div>" +
      '<div class="card list">' + (rows.length ? rows.map(function (p) {
        var ppl = p.portal_people || [], seen = ppl.filter(function (x) { return x.last_seen_at; }).length;
        var sub = [p.property_address, p.property_city].filter(Boolean).join(", ");
        var meta = p.status === "pending" ? (p.needs_attention ? '<span class="pill due">Needs a look</span>' : '<span class="pill ok">Ready</span>') : p.status === "invited" ? '<span class="pill gray">Sent ' + esc(NV.date(p.invited_at)) + "</span>" : '<span class="pill gray">' + esc(p.status) + "</span>";
        return '<a class="row" href="#portal/' + p.id + '"><div><b>' + esc(p.project_name) + '</b><span class="s">' + esc(sub) + (ppl.length ? " · " + esc(ppl.map(function (x) { return x.name; }).join(", ")) : " · No client email yet") + "</span></div>" +
          '<div class="meta">' + meta + "<span>" + (p.status === "invited" ? (seen ? seen + " signed in" : "Not opened yet") : "Won " + esc(NV.date(p.won_date))) + "</span></div></a>";
      }).join("") : '<p class="empty">' + (portalFilter === "pending" ? "Nothing to review. New wins show up here automatically." : "None yet.") + "</p>") + "</div>";
    $$("[data-f]", m).forEach(function (b) { b.onclick = function () { portalFilter = b.dataset.f; portals(); }; });
    $("#check").onclick = async function () {
      this.disabled = true; this.textContent = "Checking…";
      try { var r = await NV.fn("portal-admin", { action: "aspire-check" }); NV.toast(r.created ? r.created + " new portal" + (r.created > 1 ? "s" : "") + " added." : "No new wins since the last check."); portals(); }
      catch (e) { NV.toast(e.message); this.disabled = false; this.textContent = "Check Aspire now"; }
    };
    refreshCounts();
  }

  // ---------- one portal ----------
  async function portalSetup(id) {
    var m = $("#main");
    var p = (await sb.from("portals").select("*").eq("id", id).maybeSingle()).data;
    if (!p) { m.innerHTML = '<a class="back" href="#portals">← Client Portals</a><p class="empty">Portal not found.</p>'; return; }
    var people = (await sb.from("portal_people").select("*").eq("portal_id", id).order("is_primary", { ascending: false })).data || [];
    var mates = (await sb.from("portal_team").select("*").eq("portal_id", id)).data || [];
    var ups = (await sb.from("updates").select("id,body,hidden,created_at,staff(name)").eq("portal_id", id).order("created_at", { ascending: false }).limit(30)).data || [];
    var contact = staff.find(function (s) { return s.id === p.contact_staff_id; });
    var coverPreview = await coverSrc(p.cover_path);
    var pending = p.status === "pending";

    m.innerHTML = '<a class="back" href="#portals">← Client Portals</a>' +
      '<div class="ph"><div><h1>' + esc(p.project_name) + '</h1><p>' + esc([p.property_address, p.property_city].filter(Boolean).join(", ")) + (p.opportunity_number ? " · Aspire #" + esc(p.opportunity_number) : "") + (p.sales_rep ? " · " + esc(p.sales_rep) : "") + "</p></div>" +
      (pending ? '<span class="pill wait">Not sent yet</span>' : p.status === "invited" ? '<span class="pill ok">Live</span>' : '<span class="pill gray">' + esc(p.status) + "</span>") + "</div>" +
      (p.needs_attention ? '<div class="warn" style="margin-bottom:16px"><b>Check before sending:</b> ' + esc(p.needs_attention) + "</div>" : "") +
      '<div class="setup"><div class="stack">' +

      // 1 Look
      '<section class="card cardb box"><h2><span class="n">1</span>Look</h2>' +
      '<div class="covers" style="margin-top:14px">' + COVERS.map(function (c) { return '<button type="button" class="cov" data-cover="lib:' + c + '" aria-pressed="' + (p.cover_path === "lib:" + c) + '" style="background-image:url(\'../assets/covers/' + c + '\')" aria-label="Cover photo ' + c.replace(".jpg", "") + '"></button>'; }).join("") +
      '<button type="button" class="cov green" data-cover="" aria-pressed="' + !p.cover_path + '">Plain green</button>' +
      '<label class="cov up" style="display:grid;place-items:center;' + (p.cover_path && p.cover_path.indexOf("covers/") === 0 ? "border-color:var(--blossom-fill);border-style:solid;background-image:url('" + esc(coverPreview) + "');" : "") + '">' + (p.cover_path && p.cover_path.indexOf("covers/") === 0 ? "" : "Upload") + '<input type="file" accept="image/*" id="upcover"></label></div>' +
      '<p class="hint">Pick a photo for the top of their page, or keep it plain green until you have one.</p>' +
      '<div class="fld" style="margin-top:14px"><label for="headline">Welcome line</label><input id="headline" value="' + esc(p.headline || "") + '" placeholder="Welcome to your project."></div>' +
      '<div class="fld" style="margin-top:12px"><label for="note">Personal note in the welcome email (optional)</label><input id="note" value="' + esc(p.invite_note || "") + '" placeholder="So glad we get to build this with you."></div>' +
      "</section>" +

      // 2 Who gets it
      '<section class="card cardb box"><h2><span class="n">2</span>Who can open it</h2><div class="ppl" style="margin-top:14px">' +
      (people.length ? people.map(function (x) {
        return '<div class="p"><div><b>' + esc(x.name) + (x.is_primary ? ' <span class="pill gray">Primary</span>' : "") + '</b><span class="s">' + esc(x.email) + " · " + (x.last_seen_at ? "Last opened " + esc(NV.when(x.last_seen_at)) : x.invited_at ? "Invited " + esc(NV.date(x.invited_at)) : "Not invited yet") + '</span></div><div class="a">' +
          (!pending ? '<button class="btn small" type="button" data-invite="' + x.id + '">' + (x.invited_at ? "Resend" : "Send invite") + "</button>" : "") +
          '<button class="btn quiet small" type="button" data-rm="' + x.id + '">Remove</button></div></div>';
      }).join("") : '<p class="hint" style="margin:0">No one yet. Aspire had no contact email. Add one below.</p>') +
      '</div><form class="addp" id="addp"><div class="fld"><label for="pn">Name</label><input id="pn" placeholder="e.g. Priya Patel"></div><div class="fld"><label for="pe">Email</label><input id="pe" type="email" placeholder="name@example.com"></div><button class="btn" type="submit">+ Add a person</button></form>' +
      '<p class="hint">Spouses and partners each get their own sign-in.</p></section>' +

      // 3 Contact + sections
      '<section class="card cardb box"><h2><span class="n">3</span>What they see</h2>' +
      '<div class="fld" style="margin-top:14px"><label for="contact">Their contact (gets their messages)</label><select id="contact">' + staff.filter(function (s) { return s.active; }).map(function (s) { return '<option value="' + s.id + '"' + (contact && contact.id === s.id ? " selected" : "") + ">" + esc(s.name) + (s.title ? " · " + esc(s.title) : "") + "</option>"; }).join("") + "</select></div>" +
      '<div style="margin-top:16px">' + SECTIONS.map(function (s) { return '<div class="sw"><span><b>' + s[1] + '</b><span class="d">' + s[2] + '</span></span><button type="button" class="tg" role="switch" data-sec="' + s[0] + '" aria-checked="' + (p.sections[s[0]] !== false) + '" aria-label="' + s[1] + '"></button></div>'; }).join("") + "</div>" +
      '<div class="fld" style="margin-top:14px"><label for="cc">CompanyCam project ID</label><input id="cc" value="' + esc(p.companycam_project_id || "") + '" placeholder="Found automatically by address"><div class="help">The number at the end of the project\'s web address in CompanyCam.</div></div>' +
      "</section>" +

      // 4 Team
      '<section class="card cardb box"><h2><span class="n">4</span>Teammates</h2><p class="hint">Teammates can post updates to this page. Switch “show” off to keep someone off the Team tab.</p><div class="chips" style="margin-top:12px">' +
      mates.map(function (t) { var s = staff.find(function (x) { return x.id === t.staff_id; }); if (!s) return ""; return '<span class="chip' + (t.show_on_team ? "" : " off") + '">' + NV.avatar({ name: s.name, color: s.color }) + esc(s.name) + '<button type="button" data-show="' + s.id + '" title="' + (t.show_on_team ? "Hide from Team tab" : "Show on Team tab") + '">' + (t.show_on_team ? "👁" : "◌") + '</button><button type="button" data-unmate="' + s.id + '" aria-label="Remove ' + esc(s.name) + '">×</button></span>'; }).join("") +
      '<select class="add" id="addmate"><option value="">+ Add teammate</option>' + staff.filter(function (s) { return s.active && !mates.some(function (t) { return t.staff_id === s.id; }); }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("") + "</select></div></section>" +

      // 5 Updates
      '<section class="card cardb box"><h2><span class="n">5</span>Updates</h2><p class="hint">Posts go live right away. Hide any you don\'t want the client to see.</p><div class="items" style="margin-top:10px">' +
      (ups.length ? ups.map(function (u) { return '<div class="it' + (u.hidden ? " off" : "") + '"><span>' + esc(u.body.length > 120 ? u.body.slice(0, 120) + "…" : u.body) + ' <span style="color:var(--faint);font-size:12.5px">· ' + esc((u.staff && u.staff.name) || "Team") + ", " + esc(NV.when(u.created_at)) + '</span></span><button type="button" class="tg" role="switch" data-up="' + u.id + '" aria-checked="' + !u.hidden + '" aria-label="Show this update"></button></div>'; }).join("") : '<p class="hint" style="margin:0">No updates yet. <a href="../post/?p=' + p.id + '" target="_blank" rel="noopener">Post one</a></p>') + "</div></section>" +

      // 6 Items from Aspire / CompanyCam
      '<section class="card cardb box"><h2><span class="n">6</span>Invoices, files and photos</h2><p class="hint">Pulled live from Aspire and CompanyCam. Switch off anything you don\'t want shown.</p><div class="items" id="items" style="margin-top:10px"><p class="hint">Loading from Aspire…</p></div></section>' +

      '</div><aside class="prev"><div class="card cardb"><div class="lab" style="margin-bottom:8px">Their page</div><div class="mini"><div class="mh"><img src="../assets/logo/nv-horizontal-reverse.svg" alt=""></div><div class="mc' + (coverPreview ? "" : " plain") + '" id="minicover"' + (coverPreview ? ' style="background-image:url(\'' + esc(coverPreview) + '\')"' : "") + '><b id="minihead">' + esc(p.headline || p.project_name) + '</b></div><div class="mt" id="minitabs"></div></div>' +
      (pending ? '<button class="btn warm big" type="button" id="send"' + (people.length ? "" : " disabled") + ">Approve &amp; send</button><p class=\"hint\">" + (people.length ? "Emails " + esc(people.map(function (x) { return x.name.split(" ")[0]; }).join(" and ")) + " a sign-in link from " + esc((contact || me).name) + "." : "Add a person with an email first.") + "</p>" : "") +
      '<div class="side-acts"><a class="btn" href="../portal/?p=' + p.id + '" target="_blank" rel="noopener">Preview as the client ↗</a><a class="btn" href="../post/?p=' + p.id + '" target="_blank" rel="noopener">Post an update ↗</a>' +
      (pending ? '<button class="btn quiet small" type="button" data-status="skipped">Skip this one (no portal)</button>' : p.status === "invited" ? '<button class="btn quiet small" type="button" data-status="archived">Archive (job finished)</button>' : '<button class="btn quiet small" type="button" data-status="' + (p.invited_at ? "invited" : "pending") + '">Restore</button>') +
      "</div></div></aside></div>";

    function miniTabs() { $("#minitabs").innerHTML = ["Overview"].concat(SECTIONS.filter(function (s) { return p.sections[s[0]] !== false; }).map(function (s) { return s[1]; })).map(esc).join(" · "); }
    miniTabs();

    async function save(patch, msg) {
      Object.assign(p, patch);
      var r = await sb.from("portals").update(patch).eq("id", id);
      NV.toast(r.error ? "Couldn't save. Try again." : (msg || "Saved."));
      return !r.error;
    }

    // look
    $$("[data-cover]", m).forEach(function (b) { b.onclick = async function () { await save({ cover_path: b.dataset.cover || null }, "Cover updated."); portalSetup(id); }; });
    $("#upcover").onchange = async function () {
      var f = this.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) return NV.toast("That photo is too big (15 MB max).");
      var path = "covers/" + id + "-" + Date.now() + "." + (f.name.split(".").pop() || "jpg").toLowerCase();
      NV.toast("Uploading…");
      var up = await sb.storage.from("portal-media").upload(path, f, { contentType: f.type });
      if (up.error) return NV.toast("Upload didn't work. Try a JPG or PNG.");
      await save({ cover_path: path }, "Cover uploaded."); portalSetup(id);
    };
    var t1; $("#headline").oninput = function () { var v = this.value; $("#minihead").textContent = v || p.project_name; clearTimeout(t1); t1 = setTimeout(function () { save({ headline: v.trim() || null }); }, 700); };
    var t2; $("#note").oninput = function () { var v = this.value; clearTimeout(t2); t2 = setTimeout(function () { save({ invite_note: v.trim() || null }); }, 700); };

    // people
    $("#addp").onsubmit = async function (e) {
      e.preventDefault();
      var n = $("#pn").value.trim(), em = $("#pe").value.trim().toLowerCase();
      if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return NV.toast("Add a name and a valid email.");
      var r = await sb.from("portal_people").insert({ portal_id: id, name: n, email: em, is_primary: !people.length });
      if (r.error) return NV.toast(/duplicate/.test(r.error.message) ? "That email is already on this portal." : "Couldn't add them.");
      if (p.needs_attention && /email|contact/i.test(p.needs_attention)) await sb.from("portals").update({ needs_attention: p.needs_attention.split(". ").filter(function (x) { return !/email|contact/i.test(x); }).join(". ") || null }).eq("id", id);
      NV.toast(pending ? "Added. They'll get the email when you send." : "Added. Press Send invite to email them.");
      portalSetup(id);
    };
    $$("[data-rm]", m).forEach(function (b) { b.onclick = async function () { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Remove? Tap again"; return; } await sb.from("portal_people").delete().eq("id", b.dataset.rm); portalSetup(id); }; });
    $$("[data-invite]", m).forEach(function (b) {
      b.onclick = async function () {
        b.disabled = true; b.textContent = "Sending…";
        try { var r = await NV.fn("portal-admin", { action: "send-invite", portal_id: id, person_ids: [b.dataset.invite] }); NV.toast(r.sent.length ? "Sent to " + r.sent.join(", ") : "Didn't send. " + (r.failed || []).join(", ")); }
        catch (e) { NV.toast(e.message); }
        portalSetup(id);
      };
    });

    // what they see
    $("#contact").onchange = function () { save({ contact_staff_id: this.value }, "Contact updated."); };
    $$("[data-sec]", m).forEach(function (b) { b.onclick = function () { var on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", on); var s = Object.assign({}, p.sections); s[b.dataset.sec] = on; save({ sections: s }, (on ? "Showing " : "Hiding ") + b.getAttribute("aria-label") + "."); miniTabs(); }; });
    var t3; $("#cc").oninput = function () { var v = this.value.trim(); clearTimeout(t3); t3 = setTimeout(function () { save({ companycam_project_id: v || null }, "CompanyCam project saved."); }, 900); };

    // team
    $("#addmate").onchange = async function () { if (!this.value) return; await sb.from("portal_team").insert({ portal_id: id, staff_id: this.value }); portalSetup(id); };
    $$("[data-unmate]", m).forEach(function (b) { b.onclick = async function () { await sb.from("portal_team").delete().eq("portal_id", id).eq("staff_id", b.dataset.unmate); portalSetup(id); }; });
    $$("[data-show]", m).forEach(function (b) { b.onclick = async function () { var t = mates.find(function (x) { return x.staff_id === b.dataset.show; }); await sb.from("portal_team").update({ show_on_team: !t.show_on_team }).eq("portal_id", id).eq("staff_id", b.dataset.show); portalSetup(id); }; });

    // updates
    $$("[data-up]", m).forEach(function (b) { b.onclick = async function () { var on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", on); b.closest(".it").classList.toggle("off", !on); var r = await sb.from("updates").update({ hidden: !on }).eq("id", b.dataset.up); NV.toast(r.error ? "Couldn't change that." : on ? "Update shown." : "Update hidden."); }; });

    // status
    $$("[data-status]", m).forEach(function (b) { b.onclick = async function () { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent += "? Tap again"; return; } await save({ status: b.dataset.status }, "Done."); location.hash = "#portals"; }; });
    var send = $("#send");
    if (send) send.onclick = async function () {
      send.disabled = true; send.textContent = "Sending…";
      try {
        var r = await NV.fn("portal-admin", { action: "send-invite", portal_id: id });
        NV.toast(r.failed && r.failed.length ? "Sent to " + r.sent.length + ". Didn't send to " + r.failed.join(", ") + "." : "Sent. They'll get the email in a minute.");
        portalSetup(id); refreshCounts();
      } catch (e) { NV.toast(e.message); send.disabled = false; send.innerHTML = "Approve &amp; send"; }
    };

    loadItems(p);
  }

  async function coverSrc(path) {
    if (!path) return null;
    if (path.indexOf("lib:") === 0) return "../assets/covers/" + path.slice(4);
    var r = await sb.storage.from("portal-media").createSignedUrl(path, 3600);
    return r.data ? r.data.signedUrl : null;
  }

  // Invoices / documents / photos with on-off switches (uses the client view in preview mode).
  async function loadItems(p) {
    var box = $("#items"); if (!box) return;
    var d;
    try { d = await NV.fn("portal-data", { portal_id: p.id }); }
    catch (e) { box.innerHTML = '<p class="hint">Couldn\'t reach Aspire right now. ' + esc(e.message) + "</p>"; return; }
    var hidden = Object.assign({ invoices: [], photos: [], documents: [] }, p.hidden_items);
    var html = "";
    html += "<h3>Invoices</h3>" + ((d.invoices || []).length ? d.invoices.map(function (i) { return '<div class="it' + (i.hidden ? " off" : "") + '"><span>#' + esc(i.number) + " · " + esc(NV.date(i.date)) + " · " + NV.money(i.amount) + (Number(i.remaining) > 0 ? " · " + NV.money(i.remaining) + " due" : " · paid") + '</span><button type="button" class="tg" role="switch" data-kind="invoices" data-item="' + i.id + '" aria-checked="' + !i.hidden + '" aria-label="Show invoice ' + esc(i.number) + '"></button></div>'; }).join("") : '<p class="hint" style="margin:0">None yet.</p>');
    html += "<h3>Files marked “Show customer” in Aspire</h3>" + ((d.documents || []).length ? d.documents.map(function (x) { return '<div class="it' + (x.hidden ? " off" : "") + '"><span>' + esc(x.name) + '</span><button type="button" class="tg" role="switch" data-kind="documents" data-item="' + x.id + '" aria-checked="' + !x.hidden + '" aria-label="Show ' + esc(x.name) + '"></button></div>'; }).join("") : '<p class="hint" style="margin:0">None yet.</p>');
    html += "<h3>CompanyCam photos tagged “Client”</h3>" + ((d.photos || []).length ? '<div class="pgrid">' + d.photos.map(function (x) { return '<button type="button" data-kind="photos" data-item="' + esc(x.id) + '" aria-pressed="' + !x.hidden + '" style="background-image:url(\'' + esc(x.thumb || x.web) + '\')" aria-label="Photo, tap to ' + (x.hidden ? "show" : "hide") + '"></button>'; }).join("") + "</div>" : '<p class="hint" style="margin:0">' + (p.companycam_project_id ? "No photos tagged “Client” yet." : "No CompanyCam project linked yet.") + "</p>");
    if (d.problems && d.problems.length) html += '<p class="hint">Couldn\'t load: ' + esc(d.problems.join(", ")) + ".</p>";
    box.innerHTML = html;
    $$("[data-item]", box).forEach(function (b) {
      b.onclick = async function () {
        var kind = b.dataset.kind, raw = b.dataset.item, val = kind === "photos" ? raw : Number(raw);
        var isSwitch = b.hasAttribute("aria-checked"), showing = isSwitch ? b.getAttribute("aria-checked") === "true" : b.getAttribute("aria-pressed") === "true";
        var list = hidden[kind].filter(function (x) { return x !== val; });
        if (showing) list.push(val);
        hidden[kind] = list;
        b.setAttribute(isSwitch ? "aria-checked" : "aria-pressed", !showing);
        if (isSwitch) b.closest(".it").classList.toggle("off", showing);
        var r = await sb.from("portals").update({ hidden_items: hidden }).eq("id", p.id);
        p.hidden_items = hidden;
        NV.toast(r.error ? "Couldn't save." : showing ? "Hidden from the client." : "Shown to the client.");
      };
    });
  }

  // ========================= TEAM =========================
  async function team() {
    await loadStaff();
    var m = $("#main");
    m.innerHTML = '<div class="ph"><div><h1>Team</h1><p>Everyone who can sign in here or on the posting page, and who appears in the lead form lists.</p></div><button class="btn go" type="button" id="addstaff">+ Add a person</button></div>' +
      '<div class="card">' + staff.map(function (s) {
        return '<div class="staffrow' + (s.active ? "" : " off") + '" style="' + (s.active ? "" : "opacity:.5") + '">' + NV.avatar({ name: s.name, color: s.color }) + "<div><b>" + esc(s.name) + "</b> " + (s.role === "admin" ? '<span class="pill ok">Admin</span>' : "") + (s.active ? "" : ' <span class="pill gray">Inactive</span>') + '<div class="s">' + esc([s.title, s.email, s.phone].filter(Boolean).join(" · ")) + '</div></div><button class="btn small" type="button" data-edit="' + s.id + '">Edit</button></div>';
      }).join("") + "</div>";
    $("#addstaff").onclick = function () { staffForm({ role: "team", active: true, on_lead_form: true, can_own_accounts: false, color: "#2C6E70" }); };
    $$("[data-edit]", m).forEach(function (b) { b.onclick = function () { staffForm(staff.find(function (s) { return s.id === b.dataset.edit; })); }; });
  }

  function staffForm(s) {
    var wrap = document.createElement("div"); wrap.className = "modal";
    wrap.innerHTML = '<form class="card cardb form2" novalidate><h2>' + (s.id ? "Edit " + esc(s.name) : "Add a person") + "</h2>" +
      '<div class="grid g2"><div class="fld"><label for="sn">Name</label><input id="sn" value="' + esc(s.name || "") + '"></div><div class="fld"><label for="st">Title</label><input id="st" value="' + esc(s.title || "") + '" placeholder="e.g. Project Manager"></div></div>' +
      '<div class="grid g2"><div class="fld"><label for="se">Work email</label><input id="se" type="email" value="' + esc(s.email || "") + '"' + (s.id ? " readonly" : "") + '></div><div class="fld"><label for="sp">Phone (shown to clients if they\'re the contact)</label><input id="sp" value="' + esc(s.phone || "") + '"></div></div>' +
      '<div class="grid g2"><div class="fld"><label for="sr">Access</label><select id="sr"><option value="team"' + (s.role === "team" ? " selected" : "") + '>Team: can post updates</option><option value="admin"' + (s.role === "admin" ? " selected" : "") + '>Admin: everything here</option></select></div><div class="fld"><label for="sc">Avatar color</label><input id="sc" type="color" value="' + esc(s.color || "#2C6E70") + '" style="height:46px;padding:4px"></div></div>' +
      '<label class="chk"><input type="checkbox" id="sl"' + (s.on_lead_form ? " checked" : "") + "> In the lead form “Your name” list</label>" +
      '<label class="chk"><input type="checkbox" id="so"' + (s.can_own_accounts ? " checked" : "") + "> In the “Account owner” list</label>" +
      (s.id ? '<label class="chk"><input type="checkbox" id="sa"' + (s.active ? " checked" : "") + "> Active (can sign in)</label>" : "") +
      '<div class="inline" style="margin-top:6px"><button class="btn go" type="submit">Save</button><button class="btn" type="button" id="cancel">Cancel</button></div></form>';
    document.body.appendChild(wrap);
    $("#sn", wrap).focus();
    function close() { wrap.remove(); }
    $("#cancel", wrap).onclick = close; wrap.onclick = function (e) { if (e.target === wrap) close(); };
    $("form", wrap).onsubmit = async function (e) {
      e.preventDefault();
      var row = { name: $("#sn", wrap).value.trim(), title: $("#st", wrap).value.trim() || null, email: $("#se", wrap).value.trim().toLowerCase(), phone: $("#sp", wrap).value.trim() || null, role: $("#sr", wrap).value, color: $("#sc", wrap).value, on_lead_form: $("#sl", wrap).checked, can_own_accounts: $("#so", wrap).checked };
      if (s.id) row.active = $("#sa", wrap).checked;
      if (!row.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) return NV.toast("Add a name and a valid email.");
      if (s.id === me.id && row.role !== "admin") return NV.toast("You can't remove your own admin access.");
      var r = s.id ? await sb.from("staff").update(row).eq("id", s.id) : await sb.from("staff").insert(row);
      if (r.error) return NV.toast(/duplicate/.test(r.error.message) ? "That email is already on the team." : "Couldn't save.");
      try { await NV.fn("portal-admin", { action: "ensure-login", email: row.email }); } catch (err) { NV.toast("Saved, but sign-in isn't set up yet: " + err.message); }
      close(); NV.toast("Saved."); team();
    };
  }

  // ========================= SETTINGS =========================
  async function settings() {
    var rows = (await sb.from("app_settings").select("*")).data || [], S = {};
    rows.forEach(function (r) { S[r.key] = r.value; });
    var d = S.portal_defaults || { sections: {}, headline: "" };
    var m = $("#main");
    function listEditor(key, label, hint, placeholder) {
      return '<section class="card cardb box"><h2>' + label + '</h2><p class="hint">' + hint + '</p><div class="taglist" data-list="' + key + '">' + (S[key] || []).map(function (v, i) { return "<span>" + esc(v) + '<button type="button" data-del="' + i + '" aria-label="Remove ' + esc(v) + '">×</button></span>'; }).join("") + '</div><form class="inline" data-addto="' + key + '" style="margin-top:10px"><input class="fld" style="flex:1;min-width:180px;padding:9px 11px;border:1px solid var(--line2);border-radius:10px;background:var(--ground)" placeholder="' + esc(placeholder) + '"><button class="btn small" type="submit">Add</button></form></section>';
    }
    m.innerHTML = '<div class="ph"><div><h1>Settings</h1><p>Changes save as you make them.</p></div></div><div class="stack" style="display:flex;flex-direction:column;gap:16px;max-width:760px">' +
      listEditor("lead_alert_to", "Who gets alerts", "These emails get a short alert for each new lead and each new Won job. No client details are in the email.", "jana@newvistaent.com") +
      listEditor("lead_sources", "Lead sources", "Keep this the same as the Lead Source list in Aspire.", "e.g. Parade of Homes") +
      listEditor("brands", "Brands on the lead form", "The first one is selected by default.", "Brand name") +
      listEditor("portal_branches", "Aspire branches that get a portal", "A Won job in one of these Aspire branches creates a portal for review. Must match the branch name in Aspire exactly.", "New Vista") +
      '<section class="card cardb box"><h2>New portal defaults</h2><p class="hint">What every new portal starts with. You can still change each one.</p>' +
      '<div class="fld" style="margin-top:12px"><label for="dh">Welcome line</label><input id="dh" value="' + esc(d.headline || "") + '"></div><div style="margin-top:14px">' +
      SECTIONS.map(function (s) { return '<div class="sw"><span><b>' + s[1] + '</b><span class="d">' + s[2] + '</span></span><button type="button" class="tg" role="switch" data-dsec="' + s[0] + '" aria-checked="' + (d.sections[s[0]] !== false) + '" aria-label="' + s[1] + '"></button></div>'; }).join("") + "</div></section>" +
      '<section class="card cardb box"><h2>Links</h2><div class="fld" style="margin-top:12px"><label for="bp">Billing portal (where clients pay)</label><input id="bp" value="' + esc(S.billing_portal_url || "") + '"></div>' +
      '<div class="fld" style="margin-top:12px"><label for="ct">CompanyCam tag for client photos</label><input id="ct" value="' + esc(S.companycam_tag || "Client") + '"></div></section>' +
      '<section class="card cardb box"><h2>Aspire check</h2><p class="hint">Runs every 15 minutes on its own. Last run: ' + esc(S.aspire_sync && S.aspire_sync.last_won_check ? new Date(S.aspire_sync.last_won_check).toLocaleString() : "not yet") + '.</p><p style="margin-top:12px"><button class="btn" type="button" id="check2">Check Aspire now</button></p></section>' +
      "</div>";

    async function put(key, value, msg) { S[key] = value; var r = await sb.from("app_settings").upsert({ key: key, value: value, updated_at: new Date().toISOString() }); NV.toast(r.error ? "Couldn't save." : (msg || "Saved.")); }
    $$("[data-addto]", m).forEach(function (f) {
      f.onsubmit = async function (e) { e.preventDefault(); var inp = $("input", f), v = inp.value.trim(); if (!v) return; var k = f.dataset.addto; await put(k, (S[k] || []).concat([k === "lead_alert_to" ? v.toLowerCase() : v])); settings(); };
    });
    $$("[data-list]", m).forEach(function (l) { $$("[data-del]", l).forEach(function (b) { b.onclick = async function () { var k = l.dataset.list, arr = (S[k] || []).slice(); arr.splice(Number(b.dataset.del), 1); await put(k, arr, "Removed."); settings(); }; }); });
    var t; $("#dh").oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { d.headline = v; put("portal_defaults", d); }, 700); };
    $$("[data-dsec]", m).forEach(function (b) { b.onclick = function () { var on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", on); d.sections[b.dataset.dsec] = on; put("portal_defaults", d); }; });
    var t4; $("#bp").oninput = function () { var v = this.value.trim(); clearTimeout(t4); t4 = setTimeout(function () { put("billing_portal_url", v); }, 800); };
    var t5; $("#ct").oninput = function () { var v = this.value.trim(); clearTimeout(t5); t5 = setTimeout(function () { put("companycam_tag", v || "Client"); }, 800); };
    $("#check2").onclick = async function () { this.disabled = true; try { var r = await NV.fn("portal-admin", { action: "aspire-check" }); NV.toast(r.created ? r.created + " new portal(s) added." : "No new wins."); settings(); } catch (e) { NV.toast(e.message); this.disabled = false; } };
  }

  start();
})();
