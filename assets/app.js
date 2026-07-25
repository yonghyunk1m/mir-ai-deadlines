/* MIR·AI Deadlines — app logic */
(() => {
  "use strict";

  const CATS = {
    music:      { label: "Music / MIR",  color: "var(--c-music)" },
    audio:      { label: "Audio / Speech", color: "var(--c-audio)" },
    multimodal: { label: "Multimodal",   color: "var(--c-multimodal)" },
    ai:         { label: "AI / ML",      color: "var(--c-ai)" },
    nlp:        { label: "NLP",          color: "var(--c-nlp)" },
    hci:        { label: "HCI",          color: "var(--c-hci)" },
  };

  const state = { cat: "all", query: "", showPast: true, confs: [], meta: {} };

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const urlTheme = new URLSearchParams(location.search).get("theme");
  const savedTheme = localStorage.getItem("theme");
  const sysDark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = urlTheme || savedTheme || (sysDark ? "dark" : "light");
  document.getElementById("theme-toggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", root.dataset.theme);
  });

  /* ---------- deadline math ---------- */
  // "YYYY-MM-DD HH:MM" in tz (AoE = UTC-12) -> epoch ms
  function toEpoch(dl, tz) {
    const m = dl.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m.map(Number);
    let offset = -12; // AoE default
    if (typeof tz === "string") {
      const um = tz.match(/UTC([+-]\d+(?::\d+)?)/i);
      if (um) {
        const parts = um[1].split(":");
        offset = parseInt(parts[0], 10) + (parts[1] ? Math.sign(parseInt(parts[0],10)) * parseInt(parts[1],10) / 60 : 0);
      }
    }
    return Date.UTC(y, mo - 1, d, h, mi) - offset * 3600e3;
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // show the deadline's own calendar date (in its timezone), not the local one
  function fmtDeadline(c) {
    const m = c.deadline.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : c.deadline;
  }
  const fmtLocal = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  function remaining(epoch) {
    const diff = epoch - Date.now();
    const past = diff <= 0;
    const abs = Math.abs(diff);
    const days = Math.floor(abs / 864e5);
    const hrs = Math.floor((abs % 864e5) / 36e5);
    const min = Math.floor((abs % 36e5) / 6e4);
    const sec = Math.floor((abs % 6e4) / 1e3);
    return { past, diff, days, hrs, min, sec };
  }
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- load data ---------- */
  fetch("data/conferences.yml")
    .then((r) => r.text())
    .then((txt) => {
      const doc = jsyaml.load(txt);
      state.meta = doc.meta || {};
      state.confs = (doc.conferences || []).map((c) => ({
        ...c,
        epoch: toEpoch(c.deadline, c.timezone),
      })).filter((c) => c.epoch);
      init();
    })
    .catch((e) => {
      document.getElementById("grid").innerHTML =
        `<p class="empty">Failed to load conference data. (${e.message})</p>`;
    });

  /* ---------- build UI ---------- */
  function init() {
    buildPills();
    buildHero();
    render();
    startClock();
    bindControls();
    document.getElementById("last-updated").textContent =
      `Last update ${state.meta.updated || "—"}`;
  }

  function counts() {
    const n = { all: state.confs.length };
    for (const k of Object.keys(CATS))
      n[k] = state.confs.filter((c) => (c.categories || []).includes(k)).length;
    return n;
  }

  function buildPills() {
    const n = counts();
    const wrap = document.getElementById("category-pills");
    const mk = (key, label, color) =>
      `<button class="pill ${state.cat === key ? "active" : ""}" data-cat="${key}" role="tab">
         ${color ? `<span class="swatch" style="background:${color}"></span>` : ""}
         ${label}<span class="n">${n[key]}</span>
       </button>`;
    wrap.innerHTML =
      mk("all", "All") +
      Object.entries(CATS).map(([k, v]) => mk(k, v.label, v.color)).join("");
    wrap.querySelectorAll(".pill").forEach((p) =>
      p.addEventListener("click", () => {
        state.cat = p.dataset.cat;
        wrap.querySelectorAll(".pill").forEach((q) => q.classList.toggle("active", q === p));
        rerender();
      })
    );
  }

  function buildHero() {
    const upcoming = state.confs
      .filter((c) => c.epoch > Date.now())
      .sort((a, b) => a.epoch - b.epoch);
    const next = upcoming[0];
    const n = counts();

    const stats = document.getElementById("hero-stats");
    stats.innerHTML = `
      <div class="stat"><b>${n.all}</b><span>venues tracked</span></div>
      <div class="stat"><b>${upcoming.length}</b><span>open / upcoming</span></div>
      <div class="stat"><b data-next-days>–</b><span>days to next deadline</span></div>`;

    if (next) {
      const f = document.getElementById("featured");
      f.innerHTML = `
        <div class="featured-card" data-epoch="${next.epoch}">
          <div class="featured-top">
            <div>
              <div class="featured-label">Next deadline${next.status === "estimated" ? " · estimated" : ""}</div>
              <div class="featured-name">${next.title} ${next.year}</div>
              <div class="featured-meta">${next.place} · ${next.date} · due ${fmtDeadline(next)} (${next.timezone || "AoE"})</div>
            </div>
          </div>
          <div class="featured-count" data-count>
            <div class="tick"><b data-u="d">–</b><span>days</span></div>
            <div class="tick"><b data-u="h">–</b><span>hours</span></div>
            <div class="tick"><b data-u="m">–</b><span>min</span></div>
            <div class="tick"><b data-u="s">–</b><span>sec</span></div>
          </div>
        </div>`;
    }
  }

  /* ---------- cards ---------- */
  const icoPin = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>`;
  const icoCal = `<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const icoExt = `<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4 11 13M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const icoPlus = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  function gcalLink(c) {
    const d = new Date(c.epoch);
    const stamp = d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const end = new Date(c.epoch + 36e5).toISOString().replace(/[-:]|\.\d{3}/g, "");
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: `${c.title} ${c.year} deadline`,
      dates: `${stamp}/${end}`,
      details: `${c.full_name}\n${c.link}`,
      location: c.place || "",
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  function cardHTML(c) {
    const cat = (c.categories || [])[0] || "ai";
    const r = remaining(c.epoch);
    const badge = r.past
      ? `<span class="badge passed">Passed</span>`
      : c.status === "confirmed"
      ? `<span class="badge confirmed">✓ Confirmed</span>`
      : `<span class="badge estimated">Estimated</span>`;
    const chips = (c.categories || [])
      .map((k) => `<span class="chip" style="--cat:${CATS[k].color}">${CATS[k].label}</span>`)
      .join("");
    const kind = c.kind && c.kind !== "conference"
      ? `<span class="kind">${c.kind}</span>` : "";
    return `
    <article class="card" style="--cat:${CATS[cat].color}" data-id="${c.id}" data-epoch="${c.epoch}">
      <div class="card-head">
        <div>
          <div class="card-title">${c.title}<span class="yr">${c.year}</span>${kind}</div>
          <div class="card-full">${c.full_name || ""}</div>
        </div>
        ${badge}
      </div>
      <div class="card-meta">
        <div class="row">${icoPin}<span>${c.place || "TBA"}</span></div>
        <div class="row">${icoCal}<span>${c.date || "TBA"}</span></div>
      </div>
      <div class="deadline-box">
        <div class="dl-when">
          <div class="dl-label">Deadline · ${c.timezone || "AoE"}</div>
          <div class="dl-date">${fmtDeadline(c)}</div>
          <div class="dl-local">${fmtLocal.format(c.epoch)} local</div>
        </div>
        <div class="countdown ${r.past ? "past-txt" : r.diff < 7 * 864e5 ? "soon" : ""}" data-cd>
          ${r.past ? "Closed" : ""}
        </div>
      </div>
      ${c.note ? `<div class="note">${c.note}</div>` : ""}
      <div class="card-foot">
        <div class="chips">${chips}</div>
        <div class="card-links">
          <a class="mini-btn" href="${gcalLink(c)}" target="_blank" rel="noopener" title="Add to Google Calendar">${icoPlus} Cal</a>
          <a class="mini-btn" href="${c.link}" target="_blank" rel="noopener">${icoExt} Site</a>
        </div>
      </div>
    </article>`;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.confs.filter((c) => {
      if (state.cat !== "all" && !(c.categories || []).includes(state.cat)) return false;
      if (!q) return true;
      return [c.title, c.full_name, c.place, String(c.year)]
        .join(" ").toLowerCase().includes(q);
    });
  }

  function render() {
    const list = filtered();
    const now = Date.now();
    const up = list.filter((c) => c.epoch > now).sort((a, b) => a.epoch - b.epoch);
    const past = list.filter((c) => c.epoch <= now).sort((a, b) => b.epoch - a.epoch);

    document.getElementById("grid").innerHTML = up.map(cardHTML).join("");
    const showPast = state.showPast && past.length > 0;
    document.getElementById("past-divider").hidden = !showPast;
    document.getElementById("grid-past").innerHTML = showPast ? past.map(cardHTML).join("") : "";
    document.getElementById("empty").hidden = up.length + (showPast ? past.length : 0) > 0;

    // stagger entrance
    document.querySelectorAll(".card").forEach((el, i) => {
      el.style.animationDelay = `${Math.min(i * 45, 400)}ms`;
    });
    bindSpotlight();
    tickAll();
  }

  function rerender() {
    if (document.startViewTransition) document.startViewTransition(render);
    else render();
  }

  /* ---------- live clock ---------- */
  function tickAll() {
    const now = Date.now();
    document.querySelectorAll(".card [data-cd]").forEach((el) => {
      const epoch = +el.closest(".card").dataset.epoch;
      const r = remaining(epoch);
      if (r.past) { el.textContent = "Closed"; el.classList.add("past-txt"); return; }
      el.textContent = `${r.days}d ${pad(r.hrs)}:${pad(r.min)}:${pad(r.sec)}`;
      el.classList.toggle("soon", r.diff < 7 * 864e5);
    });
    const fc = document.querySelector(".featured-card");
    if (fc) {
      const r = remaining(+fc.dataset.epoch);
      const set = (u, v) => { const el = fc.querySelector(`[data-u="${u}"]`); if (el) el.textContent = v; };
      set("d", r.days); set("h", pad(r.hrs)); set("m", pad(r.min)); set("s", pad(r.sec));
      const nd = document.querySelector("[data-next-days]");
      if (nd) nd.textContent = r.past ? "0" : r.days;
    }
  }
  function startClock() { tickAll(); setInterval(tickAll, 1000); }

  /* ---------- interactions ---------- */
  function bindSpotlight() {
    document.querySelectorAll(".card").forEach((card) => {
      card.onmousemove = (e) => {
        const b = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - b.left}px`);
        card.style.setProperty("--my", `${e.clientY - b.top}px`);
      };
    });
  }

  function bindControls() {
    const search = document.getElementById("search-input");
    search.addEventListener("input", () => { state.query = search.value; render(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
      if (e.key === "Escape") search.blur();
    });
    document.getElementById("show-past").addEventListener("change", (e) => {
      state.showPast = e.target.checked; rerender();
    });
    const nav = document.getElementById("nav");
    addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
  }
})();
