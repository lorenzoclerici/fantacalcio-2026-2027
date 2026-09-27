(() => {
  const DATA = window.ASTA_DATA;
  if (!DATA) {
    document.body.innerHTML =
      "<p style='padding:2rem;font-family:sans-serif;color:#fff'>Dati non caricati. Verifica <code>data/asta-data.js</code>.</p>";
    return;
  }

  const MODE_KEY = "campo-asta-2026-mode";
  const LEGACY_STORAGE_KEY = "campo-asta-2026-state-v1";
  const BUDGET = DATA.meta.creditiIniziali;

  const MODES = {
    classic: {
      id: "classic",
      label: "Classic",
      roleOrder: ["P", "D", "C", "A"],
      roleLabel: {
        P: "Portieri",
        D: "Difensori",
        C: "Centrocampisti",
        A: "Attaccanti",
      },
      slotCounts: { ...(DATA.meta.rosaClassic || DATA.meta.rosa) },
      ownerCount: 10,
      storageKey: "campo-asta-2026-state-classic-v2",
    },
    mantra: {
      id: "mantra",
      label: "Mantra",
      roleOrder: ["Rosa"],
      roleLabel: { Rosa: "Rosa" },
      slotCounts: { Rosa: 30 },
      ownerCount: 8,
      listRoles: ["Por", "Ds", "Dc", "B", "Dd", "E", "M", "C", "W", "T", "A", "Pc"],
      listRoleLabel: {
        Por: "Portiere",
        Ds: "Dif. sinistro",
        Dc: "Dif. centrale",
        B: "Braccetto",
        Dd: "Dif. destro",
        E: "Esterno",
        M: "Mediano",
        C: "Centrocampista",
        W: "Centrocampista off.",
        T: "Trequartista",
        A: "Attaccante",
        Pc: "Punta centrale",
      },
      flat: true,
      storageKey: "campo-asta-2026-state-mantra-v3",
    },
  };

  const MANTRA_SEARCH_PLACEHOLDER = {
    "": "CERCA GIOCATORE",
    Por: "CERCA PORTIERE",
    Ds: "CERCA DIF. SINISTRO",
    Dc: "CERCA DIF. CENTRALE",
    B: "CERCA BRACCETTO",
    Dd: "CERCA DIF. DESTRO",
    E: "CERCA ESTERNO",
    M: "CERCA MEDIANO",
    C: "CERCA CENTROCAMPISTA",
    W: "CERCA CENTROCAMPISTA",
    T: "CERCA TREQUARTISTA",
    A: "CERCA ATTACCANTE",
    Pc: "CERCA PUNTA CENTRALE",
  };

  // Schemi ufficiali Mantra (Fantacalcio.it) — ruoli alternativi separati da /
  const MANTRA_MODULES = [
    {
      id: "3-4-3",
      lines: [["Dc", "Dc", "Dc/B"], ["E", "M/C", "C", "E"], ["W/A", "A/Pc", "W/A"]],
    },
    {
      id: "3-4-1-2",
      lines: [["Dc", "Dc", "Dc/B"], ["E", "M/C", "C", "E"], ["T"], ["A/Pc", "A/Pc"]],
    },
    {
      id: "3-4-2-1",
      lines: [["Dc", "Dc", "Dc/B"], ["E", "M/C", "C", "E"], ["T", "T/A"], ["A/Pc"]],
    },
    {
      id: "3-5-2",
      lines: [["Dc", "Dc", "Dc/B"], ["E/W", "M/C", "M", "C", "E"], ["A/Pc", "A/Pc"]],
    },
    {
      id: "3-5-1-1",
      lines: [["Dc", "Dc", "Dc/B"], ["E/W", "M", "C", "M", "E/W"], ["T/A"], ["A/Pc"]],
    },
    {
      id: "4-3-3",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["M/C", "M", "C"], ["W/A", "A/Pc", "W/A"]],
    },
    {
      id: "4-3-1-2",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["M/C", "M", "C"], ["T"], ["T/A/Pc", "A/Pc"]],
    },
    {
      id: "4-4-2",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["E/W", "M/C", "C", "E"], ["A/Pc", "A/Pc"]],
    },
    {
      id: "4-1-4-1",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["M"], ["E/W", "C/T", "T", "W"], ["A/Pc"]],
    },
    {
      id: "4-4-1-1",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["E/W", "M", "C", "E/W"], ["T/A"], ["A/Pc"]],
    },
    {
      id: "4-2-3-1",
      lines: [["Dd", "Dc", "Dc", "Ds"], ["M", "M/C"], ["W/T", "T", "W/A"], ["A/Pc"]],
    },
  ];

  const MANTRA_ROLE_TONE = {
    Por: "por",
    Dd: "def",
    Ds: "def",
    Dc: "def",
    B: "def",
    E: "def",
    M: "mid",
    C: "mid",
    W: "att",
    T: "att",
    A: "fwd",
    Pc: "fwd",
  };

  let mode = loadMode();
  let cfg = MODES[mode];

  const playerById = new Map(DATA.players.map((p) => [p.id, p]));
  const players = DATA.players.slice().map((p) => ({
    ...p,
    mantraRoles: p.mantraRoles?.length
      ? p.mantraRoles
      : fallbackMantraRoles(p),
  }));

  let state = loadState();
  let selectedPlayerId = null;
  let modalPlayerId = null;
  let activeGuideTeam = Object.keys(DATA.teams)[0] || null;
  let suggestionIndex = -1;
  let assignRoleFilter = null;
  let mantraRoleFilter = "Por";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function fallbackMantraRoles(p) {
    return { P: ["Por"], D: ["Dc"], C: ["C"], A: ["Pc"] }[p.ruolo] || ["C"];
  }

  function loadMode() {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "mantra" ? "mantra" : "classic";
  }

  function saveMode() {
    localStorage.setItem(MODE_KEY, mode);
  }

  function totalSlots() {
    return Object.values(cfg.slotCounts).reduce((a, b) => a + b, 0);
  }

  function playerFvm(p) {
    if (mode === "mantra") return p.fvmMantra504 ?? p.fvm504;
    return p.fvm504;
  }

  function playerQt(p) {
    if (mode === "mantra") return p.quotazioneMantra ?? p.quotazione;
    return p.quotazione;
  }

  function playerRoles(p) {
    if (mode === "mantra") return p.mantraRoles?.length ? p.mantraRoles : fallbackMantraRoles(p);
    return [p.ruolo];
  }

  function primaryRole(p) {
    if (cfg.flat) return playerRoles(p)[0] || "Rosa";
    return playerRoles(p)[0];
  }

  function playerFitsRole(p, role) {
    if (!role || role === "Rosa") return true;
    if (mode === "mantra") return playerRoles(p).includes(role);
    return p.ruolo === role;
  }

  function displayRole(p) {
    if (mode === "mantra") return (p.mantraRoles || []).join("/") || p.ruolo;
    return p.ruolo;
  }

  function blankState() {
    const count = cfg.ownerCount || (Array.isArray(DATA.fantallenatori) ? DATA.fantallenatori.length : 10);
    const owners = Array.from({ length: count }, (_, i) => `owner-${i + 1}`);
    return {
      owners,
      ownerNames: Object.fromEntries(owners.map((o) => [o, ""])),
      purchases: [],
      budgets: Object.fromEntries(owners.map((o) => [o, BUDGET])),
    };
  }

  function ensureBudgets(st) {
    if (!st.budgets || typeof st.budgets !== "object") st.budgets = {};
    for (const o of st.owners) {
      const n = Number(st.budgets[o]);
      st.budgets[o] = Number.isFinite(n) && n >= 1 ? Math.round(n) : BUDGET;
    }
    return st;
  }

  function ensureOwnerMeta(st) {
    if (!st.ownerNames || typeof st.ownerNames !== "object") {
      st.ownerNames = {};
      for (const o of st.owners) {
        st.ownerNames[o] = String(o).startsWith("owner-") ? "" : o;
      }
    }
    for (const o of st.owners) {
      if (st.ownerNames[o] == null) st.ownerNames[o] = "";
    }
    return ensureBudgets(st);
  }

  function ownerBudget(owner) {
    return state.budgets?.[owner] ?? BUDGET;
  }

  function ownerLabel(owner) {
    const name = String(state.ownerNames?.[owner] ?? "").trim();
    if (name) return name;
    const idx = state.owners.indexOf(owner);
    return `Squadra ${idx >= 0 ? idx + 1 : "?"}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      if (!parsed?.purchases || !parsed?.owners) return blankState();
      parsed.purchases = parsed.purchases.map((buy) => {
        if (cfg.flat) return { ...buy, slotRole: "Rosa" };
        if (buy.slotRole) return buy;
        const pl = playerById.get(buy.playerId);
        return {
          ...buy,
          slotRole: pl ? pl.ruolo : buy.slotRole,
        };
      });
      return ensureOwnerMeta(parsed);
    } catch {
      return blankState();
    }
  }

  function saveState() {
    localStorage.setItem(cfg.storageKey, JSON.stringify(state));
  }

  function switchMode(next) {
    if (!MODES[next] || next === mode) return;
    saveState();
    mode = next;
    cfg = MODES[mode];
    saveMode();
    document.body.dataset.mode = mode;
    $$(".mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
    state = loadState();
    selectedPlayerId = null;
    assignRoleFilter = null;
    fillRoleFilter();
    updateMantraNav();
    if (mode !== "mantra") {
      const active = document.querySelector(".nav-item.is-active");
      if (active?.dataset.view === "moduli") switchView("rose");
    }
    const banner = $("#mode-banner");
    if (banner) {
      banner.textContent =
        mode === "mantra"
          ? "Modalità Mantra · 8 squadre · 30 slot liberi (senza suddivisione ruoli)"
          : "Modalità Classic · 10 squadre · slot P · D · C · A";
    }
    renderAll();
  }

  function purchaseMap() {
    const map = new Map();
    for (const p of state.purchases) map.set(p.playerId, p);
    return map;
  }

  function ownerRoster(owner) {
    const byRole = Object.fromEntries(cfg.roleOrder.map((r) => [r, []]));
    for (const buy of state.purchases) {
      if (buy.owner !== owner) continue;
      const player = playerById.get(buy.playerId);
      if (!player) continue;
      const slot = cfg.flat ? "Rosa" : buy.slotRole || primaryRole(player);
      if (!byRole[slot]) byRole[slot] = [];
      byRole[slot].push({ ...buy, player, slotRole: slot });
    }
    for (const r of cfg.roleOrder) byRole[r].sort((a, b) => b.price - a.price);
    return byRole;
  }

  function ownerStats(owner) {
    const roster = ownerRoster(owner);
    const spentByRole = {};
    const countByRole = {};
    let spent = 0;
    let filled = 0;
    for (const r of cfg.roleOrder) {
      const sum = roster[r].reduce((acc, x) => acc + x.price, 0);
      spentByRole[r] = sum;
      countByRole[r] = roster[r].length;
      spent += sum;
      filled += roster[r].length;
    }
    const freeSlots = totalSlots() - filled;
    const budget = ownerBudget(owner);
    const remaining = budget - spent;
    const maxBid = Math.max(0, remaining - Math.max(0, freeSlots - 1));
    const freeByRole = {};
    for (const r of cfg.roleOrder) freeByRole[r] = cfg.slotCounts[r] - countByRole[r];
    return {
      roster,
      spentByRole,
      countByRole,
      freeByRole,
      spent,
      budget,
      remaining,
      maxBid,
      freeSlots,
      filled,
    };
  }

  function setOwnerName(ownerId, newName) {
    const next = String(newName || "").trim();
    ensureOwnerMeta(state);
    const clash = state.owners.some((o) => {
      if (o === ownerId) return false;
      const other = String(state.ownerNames[o] || "").trim();
      return next && other.toLowerCase() === next.toLowerCase();
    });
    if (clash) {
      alert("Esiste già una squadra con questo nome");
      return false;
    }
    if (String(state.ownerNames[ownerId] || "") === next) return false;
    state.ownerNames[ownerId] = next;
    saveState();
    return true;
  }

  function setOwnerBudget(owner, value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return false;
    ensureBudgets(state);
    if (state.budgets[owner] === n) return false;
    state.budgets[owner] = n;
    saveState();
    return true;
  }

  function rolePct(spentRole, spentTotal) {
    if (!spentTotal) return 0;
    return Math.round((spentRole / spentTotal) * 100);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function fasciaClass(fascia) {
    if (!fascia) return "";
    const key = fascia.toLowerCase();
    if (key.includes("top")) return "top";
    if (key.includes("buon")) return "buon";
    if (key.includes("utile")) return "utile";
    if (key.includes("scommessa")) return "scommessa";
    return "";
  }

  function fillOwnerSelect(preferred) {
    const el = $("#buy-owner");
    el.innerHTML = state.owners
      .map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(ownerLabel(o))}</option>`)
      .join("");
    if (preferred && state.owners.includes(preferred)) el.value = preferred;
  }

  function renderBoard() {
    const board = $("#roster-board");
    board.innerHTML = state.owners
      .map((owner) => {
        const s = ownerStats(owner);
        let bodyHtml = "";

        if (cfg.flat) {
          const items = s.roster.Rosa || [];
          const slots = cfg.slotCounts.Rosa || 30;
          const rows = [];
          for (let i = 0; i < slots; i++) {
            const item = items[i];
            if (item) {
              rows.push(`
                <li class="slot filled" title="${escapeAttr(item.player.squadra)} · ${escapeAttr(displayRole(item.player))}">
                  <span class="pname">${escapeHtml(item.player.nome)}</span>
                  <span class="price">${item.price}</span>
                  <button type="button" class="remove" data-remove="${escapeAttr(item.id)}" title="Rimuovi">✕</button>
                </li>
              `);
            } else {
              rows.push(`
                <li class="slot empty" data-add-owner="${escapeAttr(owner)}">·</li>
              `);
            }
          }
          bodyHtml = `
            <div class="role-block flat-rosa">
              <div class="role-bar Rosa">
                <span>Rosa</span>
                <span class="pct">${items.length}/${slots}</span>
                <button type="button" class="role-add" data-add-owner="${escapeAttr(owner)}" title="Aggiungi">+</button>
              </div>
              <ul class="slot-list">${rows.join("")}</ul>
              <div class="role-totals">
                <div class="role-total-row">
                  <span>Speso</span>
                  <strong>${s.spent}</strong>
                </div>
                <div class="role-total-row remain">
                  <span>Rimasti</span>
                  <strong>${s.remaining}</strong>
                </div>
              </div>
            </div>
          `;
        } else {
          let cumulativeSpent = 0;
          bodyHtml = cfg.roleOrder
            .map((role) => {
              const items = s.roster[role];
              const slots = cfg.slotCounts[role];
              const spentRole = s.spentByRole[role];
              cumulativeSpent += spentRole;
              const remainingAfterRole = s.budget - cumulativeSpent;
              const pct = rolePct(spentRole, s.spent);
              const rows = [];
              for (let i = 0; i < slots; i++) {
                const item = items[i];
                if (item) {
                  rows.push(`
                    <li class="slot filled" title="${escapeAttr(item.player.squadra)}">
                      <span class="pname">${escapeHtml(item.player.nome)}</span>
                      <span class="price">${item.price}</span>
                      <button type="button" class="remove" data-remove="${escapeAttr(item.id)}" title="Rimuovi">✕</button>
                    </li>
                  `);
                } else {
                  rows.push(`
                    <li class="slot empty" data-add-owner="${escapeAttr(owner)}" data-add-role="${role}">·</li>
                  `);
                }
              }
              return `
                <div class="role-block">
                  <div class="role-bar ${role}">
                    <span>${role}</span>
                    <span class="pct">${pct}%</span>
                    <button type="button" class="role-add" data-add-owner="${escapeAttr(owner)}" data-add-role="${role}" title="Aggiungi">+</button>
                  </div>
                  <ul class="slot-list">${rows.join("")}</ul>
                  <div class="role-totals">
                    <div class="role-total-row">
                      <span>Speso</span>
                      <strong>${spentRole}</strong>
                    </div>
                    <div class="role-total-row remain">
                      <span>Rimasti</span>
                      <strong>${remainingAfterRole}</strong>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("");
        }

        return `
          <article class="team-col" data-owner="${escapeAttr(owner)}">
            <header class="team-head">
              <input
                class="team-name-input"
                type="text"
                value="${escapeAttr(state.ownerNames?.[owner] || "")}"
                data-owner="${escapeAttr(owner)}"
                placeholder="Nome squadra"
                aria-label="Nome squadra"
                title="Clicca per inserire il nome"
                maxlength="24"
              />
              <div class="budget-row">
                <span class="coin" aria-hidden="true"></span>
                <span class="budget" title="Crediti rimasti">${s.remaining}</span>
              </div>
              <label class="credits-edit" title="Crediti iniziali">
                <span>Crediti</span>
                <input
                  class="budget-start-input"
                  type="number"
                  min="1"
                  step="1"
                  value="${s.budget}"
                  data-owner="${escapeAttr(owner)}"
                  aria-label="Crediti iniziali"
                />
              </label>
              <div class="team-meta">
                <span class="max">$${s.maxBid} MAX</span>
                <span>${s.filled}/${totalSlots()}</span>
              </div>
              ${
                cfg.flat
                  ? ""
                  : `<div class="role-counts">${cfg.roleOrder
                      .map((r) => `<span class="${r}">${s.freeByRole[r]}</span>`)
                      .join("")}</div>`
              }
            </header>
            ${bodyHtml}
          </article>
        `;
      })
      .join("");
  }

  function getFilteredPlayers() {
    const searchEl = mode === "mantra" ? $("#list-search") : $("#list-search-classic");
    const q = normalize((searchEl?.value || "").trim());
    const role = mode === "mantra" ? mantraRoleFilter : $("#list-role").value;
    const availability = $("#list-availability").value;
    const sort = $("#list-sort").value;
    const taken = purchaseMap();

    let list = players.filter((p) => {
      if (role && !playerFitsRole(p, role)) return false;
      const buy = taken.get(p.id);
      if (availability === "liberi" && buy) return false;
      if (availability === "presi" && !buy) return false;
      if (!q) return true;
      const hay = normalize(
        [p.nome, p.squadra, p.status, p.posizione, p.specialita, p.fascia, displayRole(p)].join(" ")
      );
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (sort === "nome") return a.nome.localeCompare(b.nome, "it");
      if (sort === "quotazione") return (playerQt(b) || 0) - (playerQt(a) || 0);
      if (sort === "pma") return (b.pma || 0) - (a.pma || 0);
      return (playerFvm(b) || 0) - (playerFvm(a) || 0);
    });
    return list;
  }

  function suggestedPrice(p) {
    return p.pma || playerFvm(p) || playerQt(p) || 1;
  }

  function updateMantraSearchPlaceholder() {
    const input = $("#list-search");
    if (!input) return;
    input.placeholder = MANTRA_SEARCH_PLACEHOLDER[mantraRoleFilter] || MANTRA_SEARCH_PLACEHOLDER[""];
  }

  function renderMantraRolePills() {
    const box = $("#mantra-role-pills");
    if (!box) return;
    const labels = MODES.mantra.listRoleLabel;
    box.innerHTML = MODES.mantra.listRoles
      .map(
        (r) => `
        <button
          type="button"
          class="mantra-role-pill${mantraRoleFilter === r ? " is-active" : ""}"
          data-mantra-role="${escapeAttr(r)}"
          title="${escapeAttr(labels[r] || r)}"
          aria-pressed="${mantraRoleFilter === r ? "true" : "false"}"
        >${escapeHtml(r)}</button>`
      )
      .join("");
    updateMantraSearchPlaceholder();
  }

  function fillRoleFilter() {
    const isMantra = mode === "mantra";
    const mantraBar = $("#mantra-filter-bar");
    const classicBar = $("#classic-filter-bar");
    if (mantraBar) mantraBar.hidden = !isMantra;
    if (classicBar) classicBar.hidden = isMantra;

    if (isMantra) {
      renderMantraRolePills();
      return;
    }

    const sel = $("#list-role");
    if (!sel) return;
    const current = sel.value;
    const roles = cfg.roleOrder;
    const labels = cfg.roleLabel;
    sel.innerHTML =
      `<option value="">Tutti</option>` +
      roles
        .map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)} · ${escapeHtml(labels[r] || r)}</option>`)
        .join("");
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  function renderListone() {
    const taken = purchaseMap();
    const list = getFilteredPlayers();
    const withPma = list.filter((p) => p.pma != null).length;
    $("#list-count").textContent = `${list.length} giocatori · PMA su ${withPma}`;
    const pmaMeta = DATA.meta.pma;
    const note = $("#pma-note");
    if (note && pmaMeta) {
      note.innerHTML = `PMA: Classic ~10 · agg. ${escapeHtml(pmaMeta.aggiornato)} · <a href="${escapeAttr(pmaMeta.url)}" target="_blank" rel="noopener">fonte</a>`;
    }
    $("#player-tbody").innerHTML = list
      .map((p) => {
        const buy = taken.get(p.id);
        const fc = fasciaClass(p.fascia);
        const fvm = playerFvm(p);
        const qt = playerQt(p);
        const badge = mode === "mantra" ? primaryRole(p) : p.ruolo;
        const delta =
          p.pma != null && fvm != null ? p.pma - fvm : null;
        const deltaCls =
          delta == null ? "" : delta > 5 ? "pma-hot" : delta < -5 ? "pma-cold" : "";
        return `
          <tr class="${buy ? "is-taken" : ""}">
            <td><span class="role-badge ${badge}" title="${escapeAttr(displayRole(p))}">${escapeHtml(badge)}</span></td>
            <td>
              <strong>${escapeHtml(p.nome)}</strong>
              <div class="taken-by">${
                mode === "mantra"
                  ? escapeHtml(displayRole(p))
                  : escapeHtml(p.posizione || p.ruolo)
              }${p.specialita ? " · " + escapeHtml(p.specialita) : ""}</div>
            </td>
            <td>${escapeHtml(p.squadra)}</td>
            <td>${escapeHtml(p.status || "—")}</td>
            <td>${qt ?? "—"}</td>
            <td><strong>${fvm ?? "—"}</strong></td>
            <td class="pma-cell ${deltaCls}" title="${
              delta == null
                ? "PMA non disponibile"
                : `PMA vs FVM: ${delta > 0 ? "+" : ""}${delta}`
            }">${p.pma ?? "—"}</td>
            <td>${p.fascia ? `<span class="fascia ${fc}">${escapeHtml(p.fascia)}</span>` : "—"}</td>
            <td>
              ${
                buy
                  ? `<span class="taken-by">${escapeHtml(ownerLabel(buy.owner))} · ${buy.price}</span>`
                  : `<button class="btn-mini" data-action="assign-from-list" data-id="${escapeAttr(p.id)}">Assegna</button>`
              }
              <button class="btn-mini" data-action="info" data-id="${escapeAttr(p.id)}">Info</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function initials(name) {
    const parts = String(name || "")
      .replace(/\./g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function shortName(name) {
    const parts = String(name || "").split(/\s+/).filter(Boolean);
    if (!parts.length) return name;
    if (parts.length >= 2 && /^(de|di|del|della|van|el)$/i.test(parts[parts.length - 2])) {
      return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1];
  }

  function parseFormation(formazione) {
    return String(formazione || "")
      .split(";")
      .map((line) =>
        line
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      )
      .filter((line) => line.length);
  }

  function primaryModulo(modulo) {
    return String(modulo || "")
      .split("/")[0]
      .trim();
  }

  function resolveGuidePlayer(team, rawName) {
    const list = team.giocatori || [];
    const exact = list.find((g) => g.nome === rawName);
    if (exact) return exact;
    const n = normalize(rawName);
    let best = null;
    let bestScore = 0;
    for (const g of list) {
      const gn = normalize(g.nome);
      let score = 0;
      if (gn === n) score = 100;
      else if (gn.startsWith(n) || n.startsWith(gn)) score = 80;
      else if (gn.includes(n) || n.includes(gn)) score = 60;
      else {
        const a = n.split(/\s+/)[0];
        const b = gn.split(/\s+/)[0];
        if (a && b && (a === b || a.startsWith(b) || b.startsWith(a))) score = 40;
      }
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return bestScore >= 40 ? best : { nome: rawName, ruolo: "?", posizione: "", status: "" };
  }

  function roleFromGuidePlayer(g) {
    const r = (g.ruolo || "").toLowerCase();
    if (r.startsWith("port")) return "P";
    if (r.startsWith("dif")) return "D";
    if (r.startsWith("centro")) return "C";
    if (r.startsWith("att")) return "A";
    const pos = (g.posizione || "").toLowerCase();
    if (pos.includes("por")) return "P";
    if (pos.includes("dc") || pos.includes("dd") || pos.includes("ds") || /(^|;)b(;|$)/.test(pos)) return "D";
    if (pos.includes("pc") || /(^|;)(a|w)(;|$)/.test(pos)) return "A";
    if (pos.includes("m") || pos.includes("c") || pos.includes("t") || pos.includes("e")) return "C";
    return "C";
  }

  function isBallottaggio(status) {
    return /ballottaggio/i.test(status || "");
  }

  function renderPitch(team, taken) {
    const lines = parseFormation(team.formazione);
    const displayLines = [...lines].reverse();
    const modulo = primaryModulo(team.modulo);

    const rowsHtml = displayLines
      .map((line) => {
        const playersHtml = line
          .map((raw) => {
            const g = resolveGuidePlayer(team, raw);
            const role = roleFromGuidePlayer(g);
            const match = players.find((p) => p.nome === g.nome && p.squadra === team.nome);
            const buy = match ? taken.get(match.id) : null;
            const ballot = isBallottaggio(g.status);
            const titleParts = [
              g.nome,
              g.posizione || "",
              g.status || "",
              buy ? `Preso da ${buy.owner} (${buy.price})` : "Libero",
            ].filter(Boolean);
            return `
              <div class="pitch-player ${buy ? "is-taken" : ""} ${ballot ? "is-ballot" : ""}" title="${escapeAttr(titleParts.join(" · "))}">
                <div class="pitch-avatar role-${role}">${escapeHtml(initials(g.nome))}</div>
                <span class="pitch-name">${escapeHtml(shortName(g.nome))}</span>
                ${ballot ? `<span class="pitch-tag">vs</span>` : ""}
                ${buy ? `<span class="pitch-tag taken">ok</span>` : ""}
              </div>
            `;
          })
          .join("");
        return `<div class="pitch-row">${playersHtml}</div>`;
      })
      .join("");

    return `
      <div class="pitch-card">
        <div class="pitch-head">
          <div>
            <h3>${escapeHtml(team.nome)}</h3>
            <p>${escapeHtml(modulo || "Modulo")} · XI titolare</p>
          </div>
          <span class="pitch-mod-badge">${escapeHtml(modulo || "—")}</span>
        </div>
        <div class="pitch">
          <div class="pitch-markings" aria-hidden="true">
            <span class="pitch-halfway"></span>
            <span class="pitch-circle"></span>
            <span class="pitch-box top"></span>
            <span class="pitch-box bottom"></span>
          </div>
          <div class="pitch-lines">${rowsHtml}</div>
        </div>
        <div class="pitch-legend">
          <span><i class="lg P"></i>Por</span>
          <span><i class="lg D"></i>Dif</span>
          <span><i class="lg C"></i>Cen</span>
          <span><i class="lg A"></i>Att</span>
          <span class="muted">bordo tratteggiato = ballottaggio</span>
        </div>
      </div>
    `;
  }

  function renderBallottaggiChips(team) {
    const items = String(team.ballottaggi || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return `<p class="empty-state" style="margin:0">Nessun ballottaggio segnalato</p>`;
    return `
      <div class="ballot-list">
        ${items
          .map((item) => {
            const [a, b] = item.split("/").map((x) => x.trim());
            return `
              <div class="ballot-row">
                <span>${escapeHtml(a || item)}</span>
                <span class="ballot-vs">vs</span>
                <span>${escapeHtml(b || "—")}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderSpecialists(label, value) {
    const names = String(value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return "";
    return `
      <div class="spec-block">
        <strong>${escapeHtml(label)}</strong>
        <div class="spec-chips">
          ${names
            .map(
              (n, i) =>
                `<span class="spec-chip"><em>${i + 1}</em>${escapeHtml(shortName(n))}</span>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderGuideNav() {
    const names = Object.keys(DATA.teams).sort((a, b) => a.localeCompare(b, "it"));
    $("#team-nav").innerHTML = names
      .map(
        (name) =>
          `<button type="button" data-team="${escapeAttr(name)}" class="${
            name === activeGuideTeam ? "is-active" : ""
          }">${escapeHtml(name)}</button>`
      )
      .join("");
  }

  function renderGuide() {
    const team = DATA.teams[activeGuideTeam];
    const detail = $("#guide-detail");
    if (!team) {
      detail.innerHTML = `<p class="empty-state">Seleziona una squadra</p>`;
      return;
    }
    const taken = purchaseMap();
    detail.innerHTML = `
      <div class="guide-top">
        ${renderPitch(team, taken)}
        <aside class="guide-side">
          <div class="guide-side-card">
            <p class="side-label">Allenatore</p>
            <h3>${escapeHtml(team.allenatore || "—")}</h3>
            <p class="side-mod">Modulo ${escapeHtml(team.modulo || "—")}</p>
          </div>
          <div class="guide-side-card">
            <p class="side-label">Specialisti</p>
            ${renderSpecialists("Rigoristi", team.rigoristi)}
            ${renderSpecialists("Calci piazzati", team.piazzati)}
          </div>
          <div class="guide-side-card">
            <p class="side-label">Ballottaggi</p>
            ${renderBallottaggiChips(team)}
          </div>
        </aside>
      </div>

      <div class="guide-roster-head">
        <h3>Rosa completa</h3>
        <p>Clicca Assegna per inserire un giocatore nell'asta</p>
      </div>
      <div class="table-wrap" style="max-height:none">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ruolo</th><th>Calciatore</th><th>Pos</th><th>Status</th>
              <th>Qt</th><th>FVM</th><th>PMA</th><th>Fascia</th><th>Consiglio</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${team.giocatori
              .map((g) => {
                const match = players.find((p) => p.nome === g.nome && p.squadra === team.nome);
                const id = match?.id;
                const buy = id ? taken.get(id) : null;
                const pma = match?.pma;
                return `
                  <tr class="${buy ? "is-taken" : ""}">
                    <td>${escapeHtml(g.ruolo)}</td>
                    <td><strong>${escapeHtml(g.nome)}</strong></td>
                    <td>${escapeHtml(g.posizione || "—")}</td>
                    <td>${escapeHtml(g.status || "—")}</td>
                    <td>${g.quotazione ?? "—"}</td>
                    <td>${g.fvm504 ?? "—"}</td>
                    <td class="pma-cell">${pma ?? "—"}</td>
                    <td>${escapeHtml(g.fascia || "—")}</td>
                    <td style="max-width:260px;font-size:.8rem">${escapeHtml(g.consiglio || "—")}</td>
                    <td>
                      ${
                        id && !buy
                          ? `<button class="btn-mini" data-action="assign-from-list" data-id="${escapeAttr(id)}">Assegna</button>`
                          : buy
                            ? `<span class="taken-by">${escapeHtml(ownerLabel(buy.owner))}</span>`
                            : ""
                      }
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function mantraSlotTone(slot) {
    const primary = String(slot || "").split("/")[0];
    return MANTRA_ROLE_TONE[primary] || "mid";
  }

  function renderMantraModulePitch(mod) {
    const attackFirst = [...mod.lines].reverse();
    const rows = [
      ...attackFirst.map(
        (line) => `
        <div class="mod-pitch-row">
          ${line
            .map(
              (slot) =>
                `<span class="mod-slot tone-${mantraSlotTone(slot)}" title="${escapeAttr(slot)}">${escapeHtml(slot)}</span>`
            )
            .join("")}
        </div>`
      ),
      `<div class="mod-pitch-row">
        <span class="mod-slot tone-por" title="Portiere">Por</span>
      </div>`,
    ];
    return `<div class="mod-pitch" aria-hidden="true">${rows.join("")}</div>`;
  }

  function renderModuli() {
    const grid = $("#moduli-grid");
    const legend = $("#moduli-legend");
    if (!grid) return;

    if (legend) {
      legend.innerHTML = `
        <span class="mod-leg"><i class="tone-por"></i> Por</span>
        <span class="mod-leg"><i class="tone-def"></i> Dif / E / M</span>
        <span class="mod-leg"><i class="tone-mid"></i> C</span>
        <span class="mod-leg"><i class="tone-att"></i> W / T</span>
        <span class="mod-leg"><i class="tone-fwd"></i> A / Pc</span>
      `;
    }

    grid.innerHTML = MANTRA_MODULES.map((mod) => {
      const flat = mod.lines.flat();
      return `
        <article class="modulo-card">
          <header class="modulo-card-head">
            <h3>${escapeHtml(mod.id)}</h3>
            <span class="modulo-count">${flat.length + 1} in campo</span>
          </header>
          ${renderMantraModulePitch(mod)}
          <p class="modulo-roles">
            <span class="role-chip tone-por">Por</span>
            ${flat
              .map((s) => `<span class="role-chip tone-${mantraSlotTone(s)}">${escapeHtml(s)}</span>`)
              .join("")}
          </p>
        </article>
      `;
    }).join("");
  }

  function updateMantraNav() {
    const isMantra = mode === "mantra";
    $$(".nav-item.mantra-only").forEach((el) => {
      el.hidden = !isMantra;
    });
  }

  function renderSummary() {
    $("#summary-tbody").innerHTML = state.owners
      .map((owner) => {
        const s = ownerStats(owner);
        const byClassic = { P: 0, D: 0, C: 0, A: 0 };
        for (const buy of state.purchases) {
          if (buy.owner !== owner) continue;
          const pl = playerById.get(buy.playerId);
          if (pl && byClassic[pl.ruolo] != null) byClassic[pl.ruolo] += buy.price;
        }
        return `
          <tr>
            <td>${escapeHtml(ownerLabel(owner))}</td>
            <td>${byClassic.P}</td>
            <td>${byClassic.D}</td>
            <td>${byClassic.C}</td>
            <td>${byClassic.A}</td>
            <td><strong>${s.spent}</strong></td>
            <td>${s.remaining}</td>
            <td>${s.maxBid}</td>
            <td>${s.filled}/${totalSlots()}</td>
          </tr>
        `;
      })
      .join("");
  }

  function updateUndo() {
    $("#btn-undo").disabled = state.purchases.length === 0;
  }

  function renderAll() {
    renderBoard();
    renderListone();
    renderGuideNav();
    renderGuide();
    renderModuli();
    renderSummary();
    updateUndo();
    updateMantraNav();
  }

  function renderSelected() {
    const box = $("#selected-player");
    const btn = $("#btn-buy");
    if (!selectedPlayerId) {
      box.className = "selected-player is-empty";
      box.innerHTML = "<p>Seleziona un giocatore</p>";
      btn.disabled = true;
      updateSlotRoleField(null);
      updateAssignHint();
      return;
    }
    const p = playerById.get(selectedPlayerId);
    const buy = purchaseMap().get(selectedPlayerId);
    box.className = "selected-player";
    box.innerHTML = `
      <h3>${escapeHtml(p.nome)}</h3>
      <div style="color:var(--muted);font-size:.85rem">${escapeHtml(p.squadra)} · ${escapeHtml(displayRole(p))} · ${escapeHtml(p.posizione || "—")}</div>
      <div class="tags">
        <span class="tag">Qt ${playerQt(p) ?? "—"}</span>
        <span class="tag">FVM ${playerFvm(p) ?? "—"}</span>
        <span class="tag">PMA ${p.pma ?? "—"}</span>
        ${p.fascia ? `<span class="tag">${escapeHtml(p.fascia)}</span>` : ""}
        ${buy ? `<span class="tag">Già di ${escapeHtml(ownerLabel(buy.owner))}</span>` : ""}
      </div>
    `;
    btn.disabled = Boolean(buy);
    if (!buy && !$("#buy-price").value) {
      $("#buy-price").value = suggestedPrice(p);
    }
    updateSlotRoleField(p);
    updateAssignHint();
  }

  function updateSlotRoleField(player) {
    const field = $("#slot-role-field");
    const sel = $("#buy-slot-role");
    if (!field || !sel) return;
    // Mantra flat: no role slot picker
    if (!player || mode !== "mantra" || cfg.flat) {
      field.hidden = true;
      sel.innerHTML = "";
      return;
    }
    let roles = playerRoles(player);
    if (assignRoleFilter) {
      roles = roles.filter((r) => r === assignRoleFilter);
      if (!roles.length) roles = [assignRoleFilter];
    }
    roles = roles.filter((r) => cfg.slotCounts[r]);
    if (!roles.length) roles = [primaryRole(player)];
    field.hidden = false;
    const prev = sel.value;
    sel.innerHTML = roles
      .map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)} · ${escapeHtml(cfg.roleLabel[r] || r)}</option>`)
      .join("");
    if (assignRoleFilter && roles.includes(assignRoleFilter)) sel.value = assignRoleFilter;
    else if (roles.includes(prev)) sel.value = prev;
  }

  function getSelectedSlotRole(player) {
    if (cfg.flat) return "Rosa";
    if (mode === "mantra") {
      const fromSelect = $("#buy-slot-role")?.value;
      if (fromSelect) return fromSelect;
    }
    if (assignRoleFilter) return assignRoleFilter;
    return primaryRole(player);
  }

  function updateAssignHint() {
    const owner = $("#buy-owner").value;
    if (!owner) {
      $("#assign-hint").textContent = "";
      return;
    }
    const s = ownerStats(owner);
    $("#assign-hint").textContent = `${ownerLabel(owner)}: ${s.remaining} crediti · max bid $${s.maxBid} · ${s.filled}/${totalSlots()} slot · ${cfg.label}`;
  }

  function openAssign({ owner = null, role = null, playerId = null } = {}) {
    assignRoleFilter = cfg.flat ? null : role;
    selectedPlayerId = playerId;
    fillOwnerSelect(owner || state.owners[0]);
    $("#assign-kicker").textContent = cfg.flat
      ? `Nuovo acquisto · Mantra (30 slot)`
      : role
        ? `Reparto ${cfg.roleLabel[role] || role}`
        : `Nuovo acquisto · ${cfg.label}`;
    $("#assign-title").textContent = owner ? `Assegna a ${owner}` : "Assegna calciatore";
    $("#buy-search").value = playerId ? playerById.get(playerId)?.nome || "" : "";
    $("#buy-price").value = "";
    $("#buy-suggestions").hidden = true;
    renderSelected();
    updateAssignHint();
    $("#assign-modal").showModal();
    setTimeout(() => $("#buy-search").focus(), 50);
  }

  function selectPlayer(id) {
    selectedPlayerId = id;
    const p = playerById.get(id);
    $("#buy-search").value = p?.nome || "";
    $("#buy-suggestions").hidden = true;
    if (p && (!$("#buy-price").value || Number($("#buy-price").value) < 1)) {
      $("#buy-price").value = suggestedPrice(p);
    }
    renderSelected();
  }

  function canBuy(playerId, owner, price) {
    const player = playerById.get(playerId);
    if (!player) return "Giocatore non trovato";
    if (purchaseMap().has(playerId)) return "Giocatore già acquistato";
    if (!owner) return "Scegli un fantallenatore";
    if (!Number.isFinite(price) || price < 1) return "Prezzo non valido";
    const slotRole = getSelectedSlotRole(player);
    const stats = ownerStats(owner);

    if (cfg.flat) {
      if (stats.filled >= totalSlots()) return "Rosa piena (30/30)";
    } else {
      if (assignRoleFilter && !playerFitsRole(player, assignRoleFilter)) {
        return `Questo slot è per ${cfg.roleLabel[assignRoleFilter] || assignRoleFilter} (giocatore: ${displayRole(player)})`;
      }
      if (!cfg.slotCounts[slotRole]) {
        return `Ruolo ${slotRole} non disponibile in ${cfg.label}`;
      }
      if ((stats.roster[slotRole] || []).length >= cfg.slotCounts[slotRole]) {
        return `Reparto ${cfg.roleLabel[slotRole] || slotRole} pieno`;
      }
    }

    if (price > stats.remaining) return "Budget insufficiente";
    if (price > stats.maxBid) {
      return `Max bid attuale: ${stats.maxBid} (serve 1 credito per ogni slot libero rimanente)`;
    }
    return null;
  }

  function buyPlayer() {
    const playerId = selectedPlayerId;
    const owner = $("#buy-owner").value;
    const price = Number($("#buy-price").value);
    const err = canBuy(playerId, owner, price);
    if (err) {
      alert(err);
      return;
    }
    const player = playerById.get(playerId);
    const slotRole = getSelectedSlotRole(player);
    state.purchases.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      owner,
      price,
      slotRole,
      at: Date.now(),
    });
    saveState();
    selectedPlayerId = null;
    assignRoleFilter = null;
    $("#assign-modal").close();
    renderAll();
  }

  function removePurchase(id) {
    state.purchases = state.purchases.filter((p) => p.id !== id);
    saveState();
    renderAll();
  }

  function undoLast() {
    if (!state.purchases.length) return;
    state.purchases.pop();
    saveState();
    renderAll();
  }

  function openInfo(id) {
    const p = playerById.get(id);
    if (!p) return;
    modalPlayerId = id;
    const buy = purchaseMap().get(id);
    $("#modal-title").textContent = p.nome;
    $("#modal-body").innerHTML = `
      <p><strong>Squadra:</strong> ${escapeHtml(p.squadra)}</p>
      <p><strong>Ruolo Classic:</strong> ${escapeHtml(p.ruolo)} · <strong>Mantra:</strong> ${escapeHtml((p.mantraRoles || []).join("/") || "—")}</p>
      <p><strong>Posizione:</strong> ${escapeHtml(p.posizione || "—")}</p>
      <p><strong>Status:</strong> ${escapeHtml(p.status || "—")}</p>
      <p><strong>Quotazione:</strong> ${playerQt(p) ?? "—"} · <strong>FVM 504:</strong> ${playerFvm(p) ?? "—"} · <strong>PMA:</strong> ${p.pma ?? "—"}</p>
      <p class="empty-state" style="margin:0 0 .65rem;font-size:.8rem">PMA = prezzo medio asta Classic ~10 (fonte Fantacalcio-Online), scalato su 504 crediti.</p>
      <p><strong>Fascia:</strong> ${escapeHtml(p.fascia || "—")}</p>
      <p><strong>Specialità:</strong> ${escapeHtml(p.specialita || "—")}</p>
      <p><strong>Consiglio:</strong> ${escapeHtml(p.consiglio || "—")}</p>
      ${buy ? `<p><strong>Preso da:</strong> ${escapeHtml(ownerLabel(buy.owner))} a ${buy.price}</p>` : ""}
    `;
    $("#modal-assign").disabled = Boolean(buy);
    $("#player-modal").showModal();
  }

  function switchView(name) {
    if (name === "moduli" && mode !== "mantra") name = "rose";
    $$(".nav-item").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
  }

  function searchSuggestions(query) {
    const q = normalize(query.trim());
    if (q.length < 1) return [];
    const taken = purchaseMap();
    return players
      .filter((p) => {
        if (taken.has(p.id)) return false;
        if (assignRoleFilter && !playerFitsRole(p, assignRoleFilter)) return false;
        return normalize(p.nome).includes(q) || normalize(p.squadra).includes(q);
      })
      .sort((a, b) => (playerFvm(b) || 0) - (playerFvm(a) || 0))
      .slice(0, 10);
  }

  function renderSuggestions(items) {
    const box = $("#buy-suggestions");
    if (!items.length) {
      box.hidden = true;
      box.innerHTML = "";
      suggestionIndex = -1;
      return;
    }
    box.hidden = false;
    box.innerHTML = items
      .map(
        (p, i) => `
        <li>
          <button type="button" data-id="${escapeAttr(p.id)}" class="${i === suggestionIndex ? "is-active" : ""}">
            <span>${escapeHtml(p.nome)}</span>
            <span class="meta">${escapeHtml(p.squadra)} · ${escapeHtml(displayRole(p))} · FVM ${playerFvm(p) ?? "—"} · PMA ${p.pma ?? "—"}</span>
          </button>
        </li>`
      )
      .join("");
  }

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `campo-asta-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importState(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.purchases || !parsed.owners) throw new Error("Formato non valido");
        state = ensureOwnerMeta(parsed);
        saveState();
        renderAll();
        alert("Stato importato");
      } catch (e) {
        alert("Import fallito: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  // Events
  $$(".nav-item").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  $("#roster-board").addEventListener("click", (e) => {
    if (e.target.closest(".team-name-input, .budget-start-input, .credits-edit")) return;
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      if (confirm("Rimuovere questo giocatore dalla rosa?")) {
        removePurchase(removeBtn.dataset.remove);
      }
      return;
    }
    const addBtn = e.target.closest("[data-add-owner]");
    if (addBtn) {
      openAssign({
        owner: addBtn.dataset.addOwner,
        role: addBtn.dataset.addRole || null,
      });
    }
  });

  $("#roster-board").addEventListener("focusin", (e) => {
    const input = e.target.closest(".team-name-input, .budget-start-input");
    if (input) input.select();
  });

  $("#roster-board").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!e.target.closest(".team-name-input, .budget-start-input")) return;
    e.preventDefault();
    e.target.blur();
  });

  $("#roster-board").addEventListener("change", (e) => {
    const nameInput = e.target.closest(".team-name-input");
    if (nameInput) {
      const ownerId = nameInput.dataset.owner;
      if (setOwnerName(ownerId, nameInput.value)) renderAll();
      else nameInput.value = state.ownerNames?.[ownerId] || "";
      return;
    }
    const budgetInput = e.target.closest(".budget-start-input");
    if (budgetInput) {
      const owner = budgetInput.dataset.owner;
      if (setOwnerBudget(owner, budgetInput.value)) renderAll();
      else budgetInput.value = String(ownerBudget(owner));
    }
  });

  $("#btn-buy").addEventListener("click", buyPlayer);
  $("#buy-owner").addEventListener("change", updateAssignHint);
  $("#buy-price").addEventListener("input", updateAssignHint);

  $("#btn-undo").addEventListener("click", undoLast);
  $("#btn-export").addEventListener("click", exportState);
  $("#input-import").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importState(file);
    e.target.value = "";
  });
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Azzerare tutta l'asta?")) {
      state.purchases = [];
      saveState();
      renderAll();
    }
  });

  ["list-search", "list-search-classic", "list-role", "list-availability", "list-sort"].forEach((id) => {
    const el = $(`#${id}`);
    if (!el) return;
    el.addEventListener("input", renderListone);
    el.addEventListener("change", renderListone);
  });

  $("#mantra-role-pills")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mantra-role]");
    if (!btn) return;
    const role = btn.dataset.mantraRole;
    mantraRoleFilter = mantraRoleFilter === role ? "" : role;
    renderMantraRolePills();
    renderListone();
  });

  $("#player-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "info") openInfo(btn.dataset.id);
    if (btn.dataset.action === "assign-from-list") {
      openAssign({ playerId: btn.dataset.id });
    }
  });

  $("#team-nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-team]");
    if (!btn) return;
    activeGuideTeam = btn.dataset.team;
    renderGuideNav();
    renderGuide();
  });

  $("#guide-detail").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='assign-from-list']");
    if (btn) openAssign({ playerId: btn.dataset.id });
  });

  $("#modal-assign").addEventListener("click", () => {
    if (!modalPlayerId) return;
    $("#player-modal").close();
    openAssign({ playerId: modalPlayerId });
  });

  const buySearch = $("#buy-search");
  buySearch.addEventListener("input", () => {
    const items = searchSuggestions(buySearch.value);
    suggestionIndex = items.length ? 0 : -1;
    renderSuggestions(items);
  });
  buySearch.addEventListener("keydown", (e) => {
    const box = $("#buy-suggestions");
    if (box.hidden) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    const buttons = $$("button", box);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestionIndex = Math.min(buttons.length - 1, suggestionIndex + 1);
      buttons.forEach((b, i) => b.classList.toggle("is-active", i === suggestionIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestionIndex = Math.max(0, suggestionIndex - 1);
      buttons.forEach((b, i) => b.classList.toggle("is-active", i === suggestionIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = buttons[suggestionIndex];
      if (target) selectPlayer(target.dataset.id);
    } else if (e.key === "Escape") {
      box.hidden = true;
    }
  });
  $("#buy-suggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (btn) selectPlayer(btn.dataset.id);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) {
      const box = $("#buy-suggestions");
      if (box) box.hidden = true;
    }
  });

  // Keyboard: press "/" to open quick assign
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.matches("input, textarea, select")) {
      e.preventDefault();
      openAssign({});
    }
  });

  // Mode switch
  $$(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
  });
  document.body.dataset.mode = mode;
  $$(".mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));

  // Banner under nav
  const mainEl = document.querySelector("main");
  if (mainEl && !$("#mode-banner")) {
    const banner = document.createElement("p");
    banner.id = "mode-banner";
    banner.className = "mode-banner";
    banner.textContent =
      mode === "mantra"
        ? "Modalità Mantra · 8 squadre · 30 slot liberi (senza suddivisione ruoli)"
        : "Modalità Classic · 10 squadre · slot P · D · C · A";
    mainEl.prepend(banner);
  }

  fillRoleFilter();
  renderAll();
})();
