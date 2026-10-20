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
  const err = (e) => toast(e?.message || String(e), "error");
  const toast = (s, type = "") => {
    const t = $("#toast");
    t.textContent = s;
    t.className = "toast " + type;
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 5000);
  };
  let sb = null,
    user = null,
    profile = null,
    jobs = [],
    currentView = "home",
    authMode = "login",
    adminTab = "companies";
  const pageRole = document.body.dataset.portal || "public";
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

  const configured = () =>
    window.ISABELA_SUPABASE_URL?.startsWith("https://") &&
    !window.ISABELA_SUPABASE_URL.includes("YOUR-") &&
    window.ISABELA_SUPABASE_KEY &&
    !window.ISABELA_SUPABASE_KEY.includes("YOUR_");
  async function q(p) {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  }
  const active = () => profile?.approval_status === "active";
  const isAdmin = () => active() && profile.role === "admin";
  const isCompany = () => active() && profile.role === "company";
  const isSeeker = () => active() && profile.role === "seeker";
  const roleNote = () =>
    !user
      ? "Please log in or create an account first."
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
    $$(".view").forEach((x) => x.classList.toggle("active", x.id === view));
    $$(".nav-link").forEach((x) =>
      x.classList.toggle("active", x.dataset.view === view),
    );
    closeNavigation();
    window.scrollTo(0, 0);
    renderView().catch(err);
  }
  const gate = (message) =>
    `<div class="note">${message}</div>${!user ? '<button class="btn" data-auth="login">Log in / Sign up</button>' : ""}`;
  function redrawNav() {
    const role = profile?.role;
    $("#signedInAs").textContent = user
      ? `${profile?.full_name || user.email} · ${role || "Member"}`
      : "";
    $("#authBtn").classList.toggle("hidden", !!user);
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
    jobs = await q(
      sb
        .from("jobs")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
    );
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
  }
  function renderJobs() {
    const term = $("#searchBox").value.trim().toLowerCase(),
      location = $("#locationSearch").value.trim().toLowerCase(),
      cat = $("#categoryFilter").value,
      type = $("#typeFilter").value;
    const matching = jobs.filter(
      (j) =>
        (!term ||
          [j.title, j.description, j.qualifications, j.company_name, j.location]
            .join(" ")
            .toLowerCase()
            .includes(term)) &&
        (!location || (j.location || "").toLowerCase().includes(location)) &&
        (!cat || j.category === cat) &&
        (!type || j.employment_type === type),
    );
    $("#jobGrid").innerHTML = matching.length
      ? matching
          .map(
            (j) =>
              `<article class="job-card"><div class="job-card-head"><div class="job-logo">${esc((j.company_name || "C").slice(0, 1).toUpperCase())}</div><div><h3>${esc(j.title)}</h3><div class="company">${esc(j.company_name || "Local employer")}</div></div></div><div class="job-meta"><span class="pill green">${esc(j.employment_type)}</span><span class="pill">${esc(j.category)}</span></div><p>${esc(j.description).slice(0, 145)}${j.description.length > 145 ? "…" : ""}</p><div class="job-bottom"><small>⌖ ${esc(j.location)} · ${fmt(j.created_at)}</small><button class="mini" data-details="${j.id}">View details →</button></div></article>`,
          )
          .join("")
      : empty("No jobs match your search. Try adjusting the filters.");
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
    $("#applyJobId").value = id;
    $("#applyJobTitle").textContent = "Apply: " + j.title;
    $("#requiredFiles").innerHTML =
      "<strong>Employer requirements</strong>" + reqList(j.requirements);
    $("#applyForm").reset();
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
    authMode = mode;
    $("#authForm").reset();
    refreshAuthDialog();
    $("#authDialog").showModal();
  }
  function refreshAuthDialog() {
    const reg = authMode === "register";
    $("#authTitle").textContent = reg ? "Create your account" : "Log in";
    $("#authSubtitle").textContent = reg
      ? "Job seekers are activated immediately. Employers require admin approval."
      : "Access your personal workspace.";
    $("#registerFields").classList.toggle("hidden", !reg);
    $("#authSubmit").textContent = reg ? "Create account" : "Log in";
    $("#toggleAuth").textContent = reg
      ? "Already have an account? Log in"
      : "New here? Create an account";
    $("#registerName").required = reg;
    $("#registerCompany").required =
      reg && $("#roleSelect").value === "company";
    $("#registerCompanyField").classList.toggle(
      "hidden",
      !reg || $("#roleSelect").value !== "company",
    );
  }
  async function submitAuth(e) {
    e.preventDefault();
    if (!configured())
      return toast("Configure Supabase in config.js first.", "error");
    const btn = $("#authSubmit");
    btn.disabled = true;
    const f = new FormData(e.target);
    try {
      const email = f.get("email").trim(),
        password = f.get("password");
      if (authMode === "register") {
        const meta = {
          requested_role: f.get("requested_role"),
          full_name: f.get("full_name").trim(),
          company_name: f.get("company_name")?.trim() || "",
        };
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: meta,
            emailRedirectTo: location.origin + location.pathname,
          },
        });
        if (error) throw error;
        $("#authDialog").close();
        toast(
          data.session
            ? "Account created successfully."
            : "Registration successful. Check your email to verify your account.",
        );
        if (data.session) {
          user = data.user;
          await loadProfile();
          await loadJobs();
          if (enforceRoleRoute()) return;
          go("dashboard");
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        user = data.user;
        await loadProfile();
        $("#authDialog").close();
        await loadJobs();
        if (enforceRoleRoute()) return;
        go("dashboard");
        toast("Welcome back!");
      }
    } catch (e) {
      err(e);
    } finally {
      btn.disabled = false;
    }
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
    if (currentView === "dashboard") return dashboard();
    if (currentView === "post") return post();
    if (currentView === "applications") return applications();
    if (currentView === "admin") return admin();
    if (currentView === "profile") return profilePage();
  }
  const table = (headers, rows) =>
    `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows || '<tr><td colspan="8">No records yet.</td></tr>'}</tbody></table></div>`;
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
    } else if (isAdmin()) {
      apps = await q(
        sb
          .from("applications")
          .select(
            "*,profiles!applications_seeker_id_fkey(full_name,email,phone),jobs(title)",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      );
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
    if (!isAdmin()) {
      $("#adminContent").innerHTML = gate(roleNote());
      return;
    }
    const [profiles, allJobs, apps] = await Promise.all([
      q(
        sb
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      q(
        sb
          .from("jobs")
          .select("*,profiles!jobs_company_id_fkey(company_name,email)")
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      q(sb.from("applications").select("id,status").limit(500)),
    ]);
    const total = profiles.length;
    const tabs = `<div class="tabs">${[
      ["companies", "Companies"],
      ["jobs", "Job moderation"],
      ["users", "All users"],
      ["applications", "Applications"],
    ]
      .map(
        ([id, label]) =>
          `<button class="tab ${adminTab === id ? "active" : ""}" data-admin-tab="${id}">${label}</button>`,
      )
      .join("")}</div>`;
    let content = "";
    if (adminTab === "companies") {
      const companies = profiles.filter((p) => p.role === "company");
      content = table(
        ["Company", "Email", "Owner", "Status", "Registered", "Action"],
        companies
          .map(
            (p) =>
              `<tr><td><strong>${esc(p.company_name || "Unnamed")}</strong></td><td>${esc(p.email)}</td><td>${esc(p.full_name)}</td><td>${badge(p.approval_status)}</td><td>${fmt(p.created_at)}</td><td>${statusSelect(p)}</td></tr>`,
          )
          .join(""),
      );
    } else if (adminTab === "jobs") {
      content = table(
        ["Position", "Employer", "Category", "Posted", "Status", "Moderation"],
        allJobs
          .map(
            (j) =>
              `<tr><td><strong>${esc(j.title)}</strong><small>${esc(j.location)}</small></td><td>${esc(j.profiles?.company_name || j.profiles?.email || "—")}</td><td>${esc(j.category)}</td><td>${fmt(j.created_at)}</td><td>${badge(j.status)}</td><td><select aria-label="Job moderation" data-job-status="${j.id}">${["pending", "approved", "rejected", "closed"].map((s) => `<option ${s === j.status ? "selected" : ""}>${s}</option>`).join("")}</select></td></tr>`,
          )
          .join(""),
      );
    } else if (adminTab === "users") {
      content = table(
        ["Name", "Email", "Role", "Status", "Registered", "Action"],
        profiles
          .map(
            (p) =>
              `<tr><td><strong>${esc(p.full_name || "—")}</strong></td><td>${esc(p.email)}</td><td>${badge(p.role)}</td><td>${badge(p.approval_status)}</td><td>${fmt(p.created_at)}</td><td>${statusSelect(p)}</td></tr>`,
          )
          .join(""),
      );
    } else {
      content = `<p>Review all application records, documents, and statuses in Applications.</p><button class="btn" data-view="applications">Open applications →</button>`;
    }
    $("#adminContent").innerHTML =
      `<div class="stats-row"><div class="stat-mini"><b>${total}</b><span>Registered users</span></div><div class="stat-mini"><b>${profiles.filter((p) => p.role === "company" && p.approval_status === "pending").length}</b><span>Pending companies</span></div><div class="stat-mini"><b>${allJobs.filter((j) => j.status === "pending").length}</b><span>Jobs awaiting review</span></div><div class="stat-mini"><b>${apps.length}</b><span>Applications *</span></div></div><div class="note">* Dashboard displays the first 500 users/jobs/applications per query. For a larger deployment, add server-side pagination and reporting.</div><div class="panel">${tabs}${content}</div>`;
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
      $("#jobGrid").innerHTML = gate(
        "Setup required: edit config.js with your Supabase Project URL and public publishable / anon key. Then run schema.sql in Supabase SQL Editor.",
      );
      $("#totalJobs").textContent = "—";
      return;
    }
    if (!window.supabase?.createClient) {
      $("#jobGrid").innerHTML = gate(
        "Supabase JS library did not load. Check your internet connection or script URL.",
      );
      return;
    }
    sb = window.supabase.createClient(
      window.ISABELA_SUPABASE_URL,
      window.ISABELA_SUPABASE_KEY,
    );
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
    if (user) await loadProfile();
    else redrawNav();
    if (enforceRoleRoute()) return;
    await loadJobs();
    go(
      pageRole === "admin"
        ? "admin"
        : pageRole === "public"
          ? "home"
          : "dashboard",
    );
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
  $("#toggleAuth").addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";
    refreshAuthDialog();
  });
  $("#roleSelect").addEventListener("change", refreshAuthDialog);
  $("#authForm").addEventListener("submit", submitAuth);
  $("#jobForm").addEventListener("submit", submitJob);
  $("#applyForm").addEventListener("submit", submitApplication);
  $("#profileForm").addEventListener("submit", submitProfile);
  ["searchBox", "locationSearch", "categoryFilter", "typeFilter"].forEach(
    (id) => $("#" + id).addEventListener("input", renderJobs),
  );
  document.addEventListener("click", (e) => {
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
  initialize().catch(err);
})();
