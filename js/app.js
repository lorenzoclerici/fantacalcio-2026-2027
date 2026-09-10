(() => {
  const DATA = window.ASTA_DATA;
  if (!DATA) {
    document.body.innerHTML =
      "<p style='padding:2rem;font-family:sans-serif;color:#fff'>Dati non caricati. Verifica <code>data/asta-data.js</code>.</p>";
    return;
  }

  const STORAGE_KEY = "campo-asta-2026-state-v1";
  const ROLE_ORDER = ["P", "D", "C", "A"];
  const ROLE_LABEL = {
    P: "Portieri",
    D: "Difensori",
    C: "Centrocampisti",
    A: "Attaccanti",
  };
  const SLOT_COUNTS = { ...DATA.meta.rosa };
  const BUDGET = DATA.meta.creditiIniziali;
  const TOTAL_SLOTS = Object.values(SLOT_COUNTS).reduce((a, b) => a + b, 0);

  const playerById = new Map(DATA.players.map((p) => [p.id, p]));
  const players = DATA.players.slice();

  let state = loadState();
  let selectedPlayerId = null;
  let modalPlayerId = null;
  let activeGuideTeam = Object.keys(DATA.teams)[0] || null;
  let suggestionIndex = -1;
  let assignRoleFilter = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function loadState() {
    const blank = () => ({ owners: [...DATA.fantallenatori], purchases: [] });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (!parsed?.purchases || !parsed?.owners) return blank();
      return parsed;
    } catch {
      return blank();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function purchaseMap() {
    const map = new Map();
    for (const p of state.purchases) map.set(p.playerId, p);
    return map;
  }

  function ownerRoster(owner) {
    const byRole = { P: [], D: [], C: [], A: [] };
    for (const buy of state.purchases) {
      if (buy.owner !== owner) continue;
      const player = playerById.get(buy.playerId);
      if (!player) continue;
      byRole[player.ruolo].push({ ...buy, player });
    }
    for (const r of ROLE_ORDER) byRole[r].sort((a, b) => b.price - a.price);
    return byRole;
  }

  function ownerStats(owner) {
    const roster = ownerRoster(owner);
    const spentByRole = {};
    const countByRole = {};
    let spent = 0;
    let filled = 0;
    for (const r of ROLE_ORDER) {
      const sum = roster[r].reduce((acc, x) => acc + x.price, 0);
      spentByRole[r] = sum;
      countByRole[r] = roster[r].length;
      spent += sum;
      filled += roster[r].length;
    }
    const freeSlots = TOTAL_SLOTS - filled;
    const remaining = BUDGET - spent;
    const maxBid = Math.max(0, remaining - Math.max(0, freeSlots - 1));
    const freeByRole = {};
    for (const r of ROLE_ORDER) freeByRole[r] = SLOT_COUNTS[r] - countByRole[r];
    return {
      roster,
      spentByRole,
      countByRole,
      freeByRole,
      spent,
      remaining,
      maxBid,
      freeSlots,
      filled,
    };
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
      .map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`)
      .join("");
    if (preferred && state.owners.includes(preferred)) el.value = preferred;
  }

  function renderBoard() {
    const board = $("#roster-board");
    board.innerHTML = state.owners
      .map((owner) => {
        const s = ownerStats(owner);
        let cumulativeSpent = 0;
        const rolesHtml = ROLE_ORDER.map((role) => {
          const items = s.roster[role];
          const slots = SLOT_COUNTS[role];
          const spentRole = s.spentByRole[role];
          cumulativeSpent += spentRole;
          const remainingAfterRole = BUDGET - cumulativeSpent;
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
        }).join("");

        return `
          <article class="team-col" data-owner="${escapeAttr(owner)}">
            <header class="team-head">
              <p class="team-name" title="${escapeAttr(owner)}">${escapeHtml(owner)}</p>
              <div class="budget-row">
                <span class="coin" aria-hidden="true"></span>
                <span class="budget">${s.remaining}</span>
              </div>
              <div class="team-meta">
                <span class="max">$${s.maxBid} MAX</span>
                <span>${s.filled}/${TOTAL_SLOTS}</span>
              </div>
              <div class="role-counts">
                <span class="P">${s.freeByRole.P}</span>
                <span class="D">${s.freeByRole.D}</span>
                <span class="C">${s.freeByRole.C}</span>
                <span class="A">${s.freeByRole.A}</span>
              </div>
            </header>
            ${rolesHtml}
          </article>
        `;
      })
      .join("");
  }

  function getFilteredPlayers() {
    const q = normalize($("#list-search").value.trim());
    const role = $("#list-role").value;
    const availability = $("#list-availability").value;
    const sort = $("#list-sort").value;
    const taken = purchaseMap();

    let list = players.filter((p) => {
      if (role && p.ruolo !== role) return false;
      const buy = taken.get(p.id);
      if (availability === "liberi" && buy) return false;
      if (availability === "presi" && !buy) return false;
      if (!q) return true;
      const hay = normalize(
        [p.nome, p.squadra, p.status, p.posizione, p.specialita, p.fascia].join(" ")
      );
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (sort === "nome") return a.nome.localeCompare(b.nome, "it");
      if (sort === "quotazione") return (b.quotazione || 0) - (a.quotazione || 0);
      if (sort === "pma") return (b.pma || 0) - (a.pma || 0);
      return (b.fvm504 || 0) - (a.fvm504 || 0);
    });
    return list;
  }

  function suggestedPrice(p) {
    return p.pma || p.fvm504 || p.quotazione || 1;
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
        const delta =
          p.pma != null && p.fvm504 != null ? p.pma - p.fvm504 : null;
        const deltaCls =
          delta == null ? "" : delta > 5 ? "pma-hot" : delta < -5 ? "pma-cold" : "";
        return `
          <tr class="${buy ? "is-taken" : ""}">
            <td><span class="role-badge ${p.ruolo}">${p.ruolo}</span></td>
            <td>
              <strong>${escapeHtml(p.nome)}</strong>
              ${p.specialita ? `<div class="taken-by">${escapeHtml(p.specialita)}</div>` : ""}
            </td>
            <td>${escapeHtml(p.squadra)}</td>
            <td>${escapeHtml(p.status || "—")}</td>
            <td>${p.quotazione ?? "—"}</td>
            <td><strong>${p.fvm504 ?? "—"}</strong></td>
            <td class="pma-cell ${deltaCls}" title="${
              delta == null
                ? "PMA non disponibile"
                : `PMA vs FVM: ${delta > 0 ? "+" : ""}${delta}`
            }">${p.pma ?? "—"}</td>
            <td>${p.fascia ? `<span class="fascia ${fc}">${escapeHtml(p.fascia)}</span>` : "—"}</td>
            <td>
              ${
                buy
                  ? `<span class="taken-by">${escapeHtml(buy.owner)} · ${buy.price}</span>`
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
                            ? `<span class="taken-by">${escapeHtml(buy.owner)}</span>`
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

  function renderSummary() {
    $("#summary-tbody").innerHTML = state.owners
      .map((owner) => {
        const s = ownerStats(owner);
        return `
          <tr>
            <td>${escapeHtml(owner)}</td>
            <td>${s.spentByRole.P}</td>
            <td>${s.spentByRole.D}</td>
            <td>${s.spentByRole.C}</td>
            <td>${s.spentByRole.A}</td>
            <td><strong>${s.spent}</strong></td>
            <td>${s.remaining}</td>
            <td>${s.maxBid}</td>
            <td>${s.filled}/${TOTAL_SLOTS}</td>
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
    renderSummary();
    updateUndo();
  }

  function renderSelected() {
    const box = $("#selected-player");
    const btn = $("#btn-buy");
    if (!selectedPlayerId) {
      box.className = "selected-player is-empty";
      box.innerHTML = "<p>Seleziona un giocatore</p>";
      btn.disabled = true;
      updateAssignHint();
      return;
    }
    const p = playerById.get(selectedPlayerId);
    const buy = purchaseMap().get(selectedPlayerId);
    box.className = "selected-player";
    box.innerHTML = `
      <h3>${escapeHtml(p.nome)}</h3>
      <div style="color:var(--muted);font-size:.85rem">${escapeHtml(p.squadra)} · ${escapeHtml(ROLE_LABEL[p.ruolo])} · ${escapeHtml(p.posizione || "—")}</div>
      <div class="tags">
        <span class="tag">Qt ${p.quotazione ?? "—"}</span>
        <span class="tag">FVM ${p.fvm504 ?? "—"}</span>
        <span class="tag">PMA ${p.pma ?? "—"}</span>
        ${p.fascia ? `<span class="tag">${escapeHtml(p.fascia)}</span>` : ""}
        ${buy ? `<span class="tag">Già di ${escapeHtml(buy.owner)}</span>` : ""}
      </div>
    `;
    btn.disabled = Boolean(buy);
    if (!buy && !$("#buy-price").value) {
      $("#buy-price").value = suggestedPrice(p);
    }
    updateAssignHint();
  }

  function updateAssignHint() {
    const owner = $("#buy-owner").value;
    if (!owner) {
      $("#assign-hint").textContent = "";
      return;
    }
    const s = ownerStats(owner);
    $("#assign-hint").textContent = `${owner}: ${s.remaining} crediti · max bid $${s.maxBid} · ${s.filled}/${TOTAL_SLOTS} slot`;
  }

  function openAssign({ owner = null, role = null, playerId = null } = {}) {
    assignRoleFilter = role;
    selectedPlayerId = playerId;
    fillOwnerSelect(owner || state.owners[0]);
    $("#assign-kicker").textContent = role
      ? `Reparto ${ROLE_LABEL[role] || role}`
      : "Nuovo acquisto";
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
    if (assignRoleFilter && player.ruolo !== assignRoleFilter) {
      return `Questo slot è per ${ROLE_LABEL[assignRoleFilter]}`;
    }
    const stats = ownerStats(owner);
    if (stats.roster[player.ruolo].length >= SLOT_COUNTS[player.ruolo]) {
      return `Reparto ${ROLE_LABEL[player.ruolo]} pieno`;
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
    state.purchases.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      owner,
      price,
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
      <p><strong>Ruolo:</strong> ${escapeHtml(ROLE_LABEL[p.ruolo])} (${escapeHtml(p.posizione || "—")})</p>
      <p><strong>Status:</strong> ${escapeHtml(p.status || "—")}</p>
      <p><strong>Quotazione:</strong> ${p.quotazione ?? "—"} · <strong>FVM 504:</strong> ${p.fvm504 ?? "—"} · <strong>PMA:</strong> ${p.pma ?? "—"}</p>
      <p class="empty-state" style="margin:0 0 .65rem;font-size:.8rem">PMA = prezzo medio asta Classic ~10 (fonte Fantacalcio-Online), scalato su 504 crediti.</p>
      <p><strong>Fascia:</strong> ${escapeHtml(p.fascia || "—")}</p>
      <p><strong>Specialità:</strong> ${escapeHtml(p.specialita || "—")}</p>
      <p><strong>Consiglio:</strong> ${escapeHtml(p.consiglio || "—")}</p>
      ${buy ? `<p><strong>Preso da:</strong> ${escapeHtml(buy.owner)} a ${buy.price}</p>` : ""}
    `;
    $("#modal-assign").disabled = Boolean(buy);
    $("#player-modal").showModal();
  }

  function switchView(name) {
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
        if (assignRoleFilter && p.ruolo !== assignRoleFilter) return false;
        return normalize(p.nome).includes(q) || normalize(p.squadra).includes(q);
      })
      .sort((a, b) => (b.fvm504 || 0) - (a.fvm504 || 0))
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
            <span class="meta">${escapeHtml(p.squadra)} · ${p.ruolo} · FVM ${p.fvm504 ?? "—"} · PMA ${p.pma ?? "—"}</span>
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
        state = parsed;
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

  ["list-search", "list-role", "list-availability", "list-sort"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderListone);
    $(`#${id}`).addEventListener("change", renderListone);
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

  renderAll();
})();
