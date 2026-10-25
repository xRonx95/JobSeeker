/* Isabela Careers | Supabase-backed SPA. No privileged keys in the browser. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (d) =>
    new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  const badge = (s) =>
    `<span class="pill ${s === "approved" || s === "active" || s === "hired" ? "green" : s === "pending" || s === "reviewing" ? "gold" : s === "rejected" || s === "suspended" ? "red" : ""}">${esc(s || "—")}</span>`;
  const empty = (s) => `<p class="empty">${esc(s)}</p>`;
  function errorMessage(e) {
    const message = e?.message || String(e);
    if (/failed to fetch|fetch failed|networkerror|network request failed/i.test(message))
      return "The connection to the employment service was interrupted. Check your internet connection and try again.";
    if (["PGRST205", "PGRST204", "42P01", "42883", "PGRST202"].includes(e?.code))
      return "Database setup is incomplete. Apply migrations/002-career-portal.sql to an existing database, or schema.sql followed by the migration for a new project.";
    if (e?.code === "42501")
      return "Database access was denied. Check the account permissions and the policies in schema.sql.";
    return message;
  }
  const err = (e) => toast(errorMessage(e), "error");
  const toast = (s, type = "") => {
    const t = $("#toast");
    t.textContent = s;
    t.className = "toast " + type;
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 5000);
  };
  let sb = null,
    authUI = null,
    user = null,
    profile = null,
    jobs = [],
    currentView = "home",
    adminTab = "companies";
  const pageRole = document.body.dataset.portal || "public";
  const connectionScreen = document.createElement('section');
  connectionScreen.className = 'connection-screen';
  connectionScreen.setAttribute('aria-live', 'polite');
  connectionScreen.innerHTML = '<p class="section-kicker">HAPISABELA</p><h1>Connecting to your workspace</h1><p>Verifying your session and loading your account.</p>';
  $('#content').before(connectionScreen);
  connectionScreen.hidden = pageRole === 'public';
  if (pageRole !== 'public') document.body.classList.add('portal-connecting');
  const rolePaths = {
    admin: "/admin/",
    company: "/company/",
    seeker: "/job-seeker/",
  };
  function routeForRole() {
    return rolePaths[profile?.role] || "/";
  }
  function enforceRoleRoute() {
    if (!user || !profile) {
      if (pageRole !== "public") {
        location.replace("/");
        return true;
      }
      return false;
    }
    const route = routeForRole();
    if (pageRole !== profile.role) {
      location.replace(route);
      return true;
    }
    return false;
  }

  const configured = () => {
    try {
      const url = new URL(window.ISABELA_SUPABASE_URL);
      const key = window.ISABELA_SUPABASE_KEY || "";
      return url.protocol === "https:" && !url.hostname.includes("YOUR-") &&
        (key.startsWith("sb_publishable_") || key.startsWith("eyJ"));
    } catch {
      return false;
    }
  };
  async function q(p) {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  }
  const active = () => profile?.approval_status === "active";
  const isAdmin = () => active() && profile.role === "admin";
  const isCompany = () => active() && profile.role === "company";
  const isSeeker = () => active() && profile.role === "seeker";
  const vacancyUI = window.Vacancies.create({
    sb: () => sb, user: () => user, view: () => currentView,
    isAdmin, isCompany, fmt, err, toast, go, showAuth, renderJobs,
  });
  const mobileUI = window.HapMobile.create({
    user: () => user, profile: () => profile, view: () => currentView,
    go, showAuth, renderJobs, signout,
  });
  const roleNote = () =>
    !user
      ? "Please log in or create a job seeker or company account."
      : !active()
        ? `Your ${esc(profile?.role || "account")} account status is ${esc(profile?.approval_status || "unknown")}. An admin must approve company accounts before posting.`
        : `This area is not available for your ${esc(profile.role)} account.`;
  function closeNavigation() {
    $("#nav").classList.remove("open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
  });
  function go(view) {
    if (view === "jobsArea") {
      go("home");
      setTimeout(
        () => $("#jobsArea").scrollIntoView({ behavior: "smooth" }),
        40,
      );
      return;
    }
    if (!$("#" + view)) return;
    currentView = view;
    mobileUI.update(view);
    $$(".view").forEach((x) => x.classList.toggle("active", x.id === view));
    $$(".nav-link").forEach((x) =>
      x.classList.toggle("active", x.dataset.view === view),
    );
    closeNavigation();
    window.scrollTo(0, 0);
    renderView().catch(err);
  }
  const gate = (message) =>
    `<div class="note">${message}</div>${!user ? '<button class="btn" data-auth="login">Log in</button>' : ""}`;
  function redrawNav() {
    mobileUI.update();
    const role = profile?.role;
    $("#signedInAs").textContent = user
      ? `${profile?.full_name || user.email} · ${role || "Member"}`
      : "";
    $("#authBtn").classList.toggle("hidden", !!user);
    $$(".signup-button").forEach(button => button.classList.toggle("hidden", !!user));
    $("#logoutBtn").classList.toggle("hidden", !user);
    $$('[data-view="admin"]').forEach((e) =>
      e.classList.toggle("hidden", !isAdmin()),
    );
    $$('[data-view="post"]').forEach((e) =>
      e.classList.toggle("hidden", role !== "company"),
    );
    $$('[data-view="applications"]').forEach((e) =>
      e.classList.toggle("hidden", pageRole === "public"),
    );
    $$('[data-view="dashboard"]').forEach((e) =>
      e.classList.toggle("hidden", pageRole === "public"),
    );
  }
  async function loadProfile() {
    profile = user
      ? await q(sb.from("profiles").select("*").eq("id", user.id).single())
      : null;
    redrawNav();
  }
  async function loadJobs() {
    $("#jobGrid").textContent = "Loading jobs…";
    try {
    jobs = await q(
      sb
        .from("jobs")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
    );
    await vacancyUI.loadSaved();
    renderJobs();
    $("#totalJobs").textContent = jobs.length;
    $("#totalCompanies").textContent = new Set(
      jobs.map((j) => j.company_id),
    ).size;
    if (isSeeker()) {
      let a = await q(
        sb.from("applications").select("id").eq("seeker_id", user.id),
      );
      $("#myApplicationCount").textContent = a.length;
    } else $("#myApplicationCount").textContent = user ? "—" : "Sign in";
    } catch (e) {
      jobs = [];
      $("#totalJobs").textContent = "—";
      $("#totalCompanies").textContent = "—";
      $("#resultCount").textContent = "Unable to load vacancies";
      $("#jobGrid").innerHTML = `<div class="panel" role="alert"><p>${esc(errorMessage(e))}</p><button class="btn" data-retry-connection>Retry connection</button></div>`;
      throw e;
    }
  }
  function renderJobs() {
    vacancyUI.jobList(jobs);
    mobileUI.update();
  }
  const reqList = (req) =>
    req?.length
      ? `<ul>${req.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "<p>No specific documents listed by employer.</p>";
  function details(id) {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    $("#jobDetail").innerHTML =
      `<span class="eyebrow dark">OPEN OPPORTUNITY</span><h2>${esc(j.title)}</h2><p>${esc(j.company_name || "Local employer")} · ${esc(j.location)}</p><div class="job-meta"><span class="pill green">${esc(j.employment_type)}</span><span class="pill">${esc(j.category)}</span>${j.salary ? `<span class="pill">${esc(j.salary)}</span>` : ""}</div><h3>About the position</h3><p class="prewrap">${esc(j.description)}</p><h3>Qualifications</h3><p class="prewrap">${esc(j.qualifications)}</p><h3>Required documents</h3><div class="requirements">${reqList(j.requirements)}</div><button class="btn" data-apply="${j.id}">Apply to this job →</button>`;
    $("#jobDialog").showModal();
  }
  function apply(id) {
    if (!isSeeker()) {
      toast(
        !user
          ? "Log in as a Job Seeker to apply."
          : "Only active Job Seekers can apply.",
        "error",
      );
      $("#jobDialog").close();
      if (!user) showAuth();
      return;
    }
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    $("#jobDialog").close();
    $("#applyForm").reset();
    $("#applyJobId").value = id;
    $("#applyJobTitle").textContent = "Apply: " + j.title;
    $("#requiredFiles").innerHTML =
      "<strong>Employer requirements</strong>" + reqList(j.requirements);
    $("#applyDialog").showModal();
  }
  async function submitApplication(e) {
    e.preventDefault();
    if (!isSeeker()) return toast("Job Seeker account required.", "error");
    const btn = e.target.querySelector('[type="submit"]');
    const fileList = [...$("#documentsInput").files];
    if (!fileList.length)
      return toast("Please attach at least one required document.", "error");
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (fileList.length > 12) return toast("Maximum 12 documents.", "error");
    if (
      fileList.some(
        (f) => f.size > 5 * 1024 * 1024 || !allowed.includes(f.type),
      )
    )
      return toast("Only PDF, JPG, PNG, and DOCX under 5 MB each.", "error");
    btn.disabled = true;
    let appId = null;
    try {
      const row = await q(
        sb
          .from("applications")
          .insert({
            job_id: $("#applyJobId").value,
            seeker_id: user.id,
            cover_letter: new FormData(e.target).get("cover_letter") || "",
          })
          .select("id")
          .single(),
      );
      appId = row.id;
      let uploaded = 0;
      for (const f of fileList) {
        const ext = (f.name.split(".").pop() || "pdf").toLowerCase();
        const path = `${user.id}/${appId}/${crypto.randomUUID()}.${ext}`;
        await q(
          sb.storage
            .from("application-documents")
            .upload(path, f, { contentType: f.type, upsert: false }),
        );
        await q(
          sb.rpc("attach_application_document", {
            p_application: appId,
            p_path: path,
          }),
        );
        uploaded++;
      }
      $("#applyDialog").close();
      toast(`Application submitted with ${uploaded} document(s).`);
      await loadJobs();
      go("applications");
    } catch (e) {
      err(e);
      if (appId)
        toast(
          "An application record may have been created. Check Applications before retrying.",
          "error",
        );
    } finally {
      btn.disabled = false;
    }
  }
  function showAuth(mode = "login") {
    if (!authUI) return toast("The login service is loading. Please try again.", "error");
    closeNavigation();
    authUI.show(mode);
  }
  async function signout() {
    try {
      await q(sb.auth.signOut());
      user = null;
      profile = null;
      redrawNav();
      location.replace("/");
    } catch (e) {
      err(e);
    }
  }
  async function renderView() {
    if (["fairs", "training", "advice", "employers"].includes(currentView))
      return vacancyUI.renderResources(currentView);
    if (currentView === "dashboard") return dashboard();
    if (currentView === "post") return post();
    if (currentView === "applications") return applications();
    if (currentView === "admin") return admin();
    if (currentView === "profile") return profilePage();
  }
  const table = (headers, rows) =>
    `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows || '<tr><td colspan="8">No records yet.</td></tr>'}</tbody></table></div>`;
  const adminUI = window.IsabelaAdminDashboard.create({
    client: () => sb, isAdmin, getTab: () => adminTab,
    esc, badge, fmt, table, statusSelect, docLinks, err,
  });
  async function dashboard() {
    if (!user) {
      $("#dashboardContent").innerHTML = gate(roleNote());
      return;
    }
    if (!active()) {
      $("#dashboardContent").innerHTML = gate(roleNote());
      return;
    }
    if (isAdmin()) {
      go("admin");
      return;
    }
    if (isCompany()) {
      const own = await q(
        sb
          .from("jobs")
          .select("id,title,status,created_at")
          .eq("company_id", user.id)
          .order("created_at", { ascending: false }),
      );
      const count = own.length
        ? await q(
            sb
              .from("applications")
              .select("id,job_id")
              .in(
                "job_id",
                own.map((j) => j.id),
              ),
          )
        : [];
      $("#welcome").textContent =
        `Welcome, ${profile.company_name || profile.full_name}. Manage your recruitment pipeline.`;
      $("#dashboardContent").innerHTML =
        `<div class="stats-row"><div class="stat-mini"><b>${own.length}</b><span>Jobs posted</span></div><div class="stat-mini"><b>${own.filter((j) => j.status === "approved").length}</b><span>Live listings</span></div><div class="stat-mini"><b>${own.filter((j) => j.status === "pending").length}</b><span>Awaiting review</span></div><div class="stat-mini"><b>${count.length}</b><span>Total applications</span></div></div><div class="panel"><div class="section-head"><h2>My job listings</h2><button class="btn small" data-view="post">+ Post a job</button></div>${table(["Job", "Status", "Posted", "Actions"], own.map((j) => `<tr><td><strong>${esc(j.title)}</strong></td><td>${badge(j.status)}</td><td>${fmt(j.created_at)}</td><td>${j.status !== "closed" ? `<button class="mini warn" data-closejob="${j.id}">Close listing</button>` : ""}</td></tr>`).join(""))}</div>`;
    } else {
      $("#welcome").textContent =
        `Welcome, ${profile.full_name}. Find a role that matches your skills.`;
      const apps = await q(
        sb
          .from("applications")
          .select("id,status,created_at,job_id,jobs(title)")
          .eq("seeker_id", user.id)
          .order("created_at", { ascending: false }),
      );
      $("#dashboardContent").innerHTML =
        `<div class="stats-row"><div class="stat-mini"><b>${jobs.length}</b><span>Open positions</span></div><div class="stat-mini"><b>${apps.length}</b><span>Applications</span></div><div class="stat-mini"><b>${apps.filter((x) => x.status === "shortlisted").length}</b><span>Shortlisted</span></div><div class="stat-mini"><b>${apps.filter((x) => x.status === "hired").length}</b><span>Hired</span></div></div><div class="panel"><h2>Recent applications</h2>${table(["Position", "Status", "Submitted"], apps.map((a) => `<tr><td>${esc(a.jobs?.title || "Position")}</td><td>${badge(a.status)}</td><td>${fmt(a.created_at)}</td></tr>`).join(""))}</div>`;
    }
  }
  function post() {
    $("#postGate").innerHTML = isCompany() ? "" : gate(roleNote());
    $("#postGate").classList.toggle("hidden", isCompany());
    $("#jobForm").classList.toggle("hidden", !isCompany());
  }
  async function submitJob(e) {
    e.preventDefault();
    if (!isCompany()) return;
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const f = new FormData(e.target),
        obj = Object.fromEntries(f.entries());
      obj.audiences = f.getAll("audiences");
      if (!obj.audiences.length) delete obj.audiences;
      obj.requirements = obj.requirements
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);
      obj.company_id = user.id;
      obj.status = "pending";
      await q(sb.from("jobs").insert(obj));
      e.target.reset();
      toast("Job submitted. Awaiting admin approval.");
      go("dashboard");
    } catch (e) {
      err(e);
    } finally {
      btn.disabled = false;
    }
  }
  async function profilePage() {
    $("#passwordPanel").classList.toggle("hidden", !user);
    $("#profileGate").innerHTML = user
      ? !active()
        ? gate(roleNote())
        : ""
      : gate(roleNote());
    $("#profileGate").classList.toggle("hidden", !!user && active());
    $("#profileForm").classList.toggle("hidden", !user || !active());
    if (user && active()) {
      const f = $("#profileForm");
      for (const key of [
        "full_name",
        "phone",
        "location",
        "bio",
        "company_name",
      ])
        f.elements[key].value = profile[key] || "";
      $("#companyNameField").classList.toggle(
        "hidden",
        profile.role !== "company",
      );
    }
  }
  async function submitProfile(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await q(
        sb.rpc("update_my_profile", {
          p_name: f.get("full_name"),
          p_phone: f.get("phone"),
          p_location: f.get("location"),
          p_bio: f.get("bio"),
          p_company_name: f.get("company_name"),
        }),
      );
      await loadProfile();
      toast("Profile updated.");
    } catch (e) {
      err(e);
    }
  }
  async function docLinks(paths) {
    const result = [];
    for (const path of paths || []) {
      const { data, error } = await sb.storage
        .from("application-documents")
        .createSignedUrl(path, 60);
      result.push(
        error
          ? '<span class="pill red">Document unavailable</span>'
          : `<a class="mini doc-link" href="${esc(data.signedUrl)}" target="_blank" rel="noopener noreferrer">View document ↗</a>`,
      );
    }
    return result.join("") || "No documents";
  }
  async function applications() {
    if (isAdmin()) return adminUI.renderApplications();
    if (!user || !active()) {
      $("#applicationsContent").innerHTML = gate(roleNote());
      return;
    }
    $("#applicationsContent").innerHTML = "Loading applications…";
    let apps;
    if (isSeeker()) {
      apps = await q(
        sb
          .from("applications")
          .select("*,jobs(title,company_name)")
          .eq("seeker_id", user.id)
          .order("created_at", { ascending: false }),
      );
    } else if (isCompany()) {
      const own = await q(
        sb.from("jobs").select("id,title").eq("company_id", user.id),
      );
      apps = own.length
        ? await q(
            sb
              .from("applications")
              .select(
                "*,profiles!applications_seeker_id_fkey(full_name,email,phone),jobs(title)",
              )
              .in(
                "job_id",
                own.map((j) => j.id),
              )
              .order("created_at", { ascending: false }),
          )
        : [];
    } else {
      apps = [];
    }
    if (!apps.length) {
      $("#applicationsContent").innerHTML = empty("No applications found.");
      return;
    }
    const rows = await Promise.all(
      apps.map(
        async (a) =>
          `<tr><td><strong>${esc(a.jobs?.title || "Job")}</strong>${!isSeeker() ? `<small>${esc(a.profiles?.full_name || "Applicant")} · ${esc(a.profiles?.email || "")} · ${esc(a.profiles?.phone || "")}</small>` : `<small>${esc(a.jobs?.company_name || "Employer")}</small>`}</td><td>${badge(a.status)}</td><td>${fmt(a.created_at)}</td><td><div class="prewrap">${esc(a.cover_letter || "—")}</div></td><td>${await docLinks(a.document_paths)}</td><td>${!isSeeker() ? `<select aria-label="Application status" data-application-status="${a.id}">${["submitted", "reviewing", "shortlisted", "rejected", "hired"].map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select>` : "—"}</td></tr>`,
      ),
    );
    $("#applicationsContent").innerHTML = table(
      [
        "Position / Applicant",
        "Status",
        "Date",
        "Message",
        "Documents",
        "Manage",
      ],
      rows.join(""),
    );
  }
  async function admin() {
    if (!isAdmin()) { $("#adminContent").innerHTML = gate(roleNote()); return; }
    return adminUI.render();
  }
  function statusSelect(p) {
    return p.role === "admin"
      ? "Protected admin"
      : `<select aria-label="User account status" data-profile-status="${p.id}">${["active", "pending", "rejected", "suspended"].map((s) => `<option ${s === p.approval_status ? "selected" : ""}>${s}</option>`).join("")}</select>`;
  }
  async function changeStatus(el, kind) {
    const id = el.dataset[kind],
      status = el.value;
    el.disabled = true;
    try {
      if (kind === "profileStatus")
        await q(
          sb.rpc("admin_set_profile_status", { p_id: id, p_status: status }),
        );
      if (kind === "jobStatus")
        await q(sb.rpc("admin_set_job_status", { p_id: id, p_status: status }));
      if (kind === "applicationStatus")
        await q(sb.from("applications").update({ status }).eq("id", id));
      toast("Status updated.");
      await loadJobs();
      await renderView();
    } catch (e) {
      err(e);
      await renderView();
    } finally {
      el.disabled = false;
    }
  }
  async function closeJob(id) {
    if (!confirm("Close this listing?")) return;
    try {
      await q(sb.from("jobs").update({ status: "closed" }).eq("id", id));
      toast("Listing closed.");
      await dashboard();
      await loadJobs();
    } catch (e) {
      err(e);
    }
  }
  async function initialize() {
    if (!configured()) {
      throw new Error('The employment service is not configured. Please contact the site administrator.');
    }
    if (!window.supabase?.createClient) {
      throw new Error('The account library could not load. Check your internet connection and try again.');
    }
    sb = window.supabase.createClient(
      window.ISABELA_SUPABASE_URL,
      window.ISABELA_SUPABASE_KEY,
      { global: { fetch: window.IsabelaConnection.createFetch({
        upstream: window.ISABELA_SUPABASE_URL,
        proxy: window.ISABELA_SUPABASE_PROXY,
      }) } },
    );
    window.IsabelaPassword.bind(sb);
    authUI = window.IsabelaAuth.bind({ client: sb, signedIn: async account => {
      user = account;
      await loadProfile();
      if (enforceRoleRoute()) return;
      if (isAdmin()) loadJobs().catch(err);
      else await loadJobs();
      go(isAdmin() ? "admin" : "dashboard");
    } });
    window.IsabelaAdminUsers.bind({ client: sb, isAdmin, refresh: async () => { adminTab = "users"; await admin(); } });
    const { data, error } = await sb.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw error;
    user = data?.user || null;
    if (user) await loadProfile();
    else redrawNav();
    if (enforceRoleRoute()) return;
    if (pageRole === 'admin') {
      go('admin');
      loadJobs().catch(err);
    } else {
      await loadJobs();
      go(pageRole === "public" ? "home" : "dashboard");
    }
    document.body.classList.remove('portal-connecting');
    connectionScreen.hidden = true;
    sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      if (id !== (user?.id || null)) {
        setTimeout(async () => {
          try {
            user = session?.user || null;
            await loadProfile();
            if (enforceRoleRoute()) return;
            await loadJobs();
            await renderView();
          } catch (e) {
            err(e);
          }
        }, 0);
      }
    });
  }
  $("#authBtn").addEventListener("click", () => showAuth());
  $("#logoutBtn").addEventListener("click", signout);
  $("#menuBtn").addEventListener("click", () => {
    const open = $("#nav").classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", String(open));
  });
  $("#jobForm").addEventListener("submit", submitJob);
  $("#applyForm").addEventListener("submit", submitApplication);
  $("#profileForm").addEventListener("submit", submitProfile);
  ["searchBox", "locationSearch", "categoryFilter", "typeFilter"].forEach(
    (id) => $("#" + id).addEventListener("input", renderJobs),
  );
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry-connection]")) {
      location.reload();
      return;
    }
    const x = e.target.closest(
      "[data-view],[data-goto],[data-auth],[data-details],[data-apply],[data-close],[data-closejob],[data-admin-tab]",
    );
    if (!x) return;
    if (x.dataset.view) go(x.dataset.view);
    if (x.dataset.goto) go(x.dataset.goto);
    if (x.dataset.auth) showAuth(x.dataset.auth);
    if (x.dataset.details) details(x.dataset.details);
    if (x.dataset.apply) apply(x.dataset.apply);
    if (x.dataset.close) $("#" + x.dataset.close).close();
    if (x.dataset.closejob) closeJob(x.dataset.closejob);
    if (x.dataset.adminTab) {
      adminTab = x.dataset.adminTab;
      admin().catch(err);
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.profileStatus) changeStatus(el, "profileStatus");
    if (el.dataset.jobStatus) changeStatus(el, "jobStatus");
    if (el.dataset.applicationStatus) changeStatus(el, "applicationStatus");
  });
  $("#heroSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    renderJobs();
    $("#jobsArea").scrollIntoView({ behavior: "smooth" });
  });
  redrawNav();
  initialize().catch((e) => {
    if (pageRole !== 'public') {
      connectionScreen.innerHTML = `<p class="section-kicker">CONNECTION UNAVAILABLE</p><h1>Unable to open your workspace</h1><p>${esc(errorMessage(e))}</p><button class="btn" data-retry-connection>Try again</button><a href="/">Return to job search</a>`;
      return;
    }
    $("#resultCount").textContent = "Unable to load vacancies";
    $("#jobGrid").innerHTML = `<div class="panel" role="alert"><p>${esc(errorMessage(e))}</p><button class="btn" data-retry-connection>Retry connection</button></div>`;
    err(e);
  });
})();
