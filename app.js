/* =========================
   Roria Team Builder MVP
   - localStorage saves
   - multiple teams
   - 6 slots per team
   - shiny toggle swaps sprite
   - EV hex + EV bars
   ========================= */

const STORAGE_KEY = "roria_teambuilder_v1";

/** ---------- Data Model ---------- */
function emptyMon() {
  return {
    species: "",
    nickname: "",
    shiny: false,
    item: "",
    ability: "",
    nature: "",
    moves: ["", "", "", ""],
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };
}

function newTeam() {
  return {
    id: crypto.randomUUID(),
    name: "New Team",
    format: "Custom",
    mons: [emptyMon(), emptyMon(), emptyMon(), emptyMon(), emptyMon(), emptyMon()],
    updatedAt: Date.now(),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = { teams: [newTeam()], activeTeamId: null };
    initial.activeTeamId = initial.teams[0].id;
    saveState(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.teams?.length) throw new Error("bad state");
    if (!parsed.activeTeamId) parsed.activeTeamId = parsed.teams[0].id;
    return parsed;
  } catch {
    const reset = { teams: [newTeam()], activeTeamId: null };
    reset.activeTeamId = reset.teams[0].id;
    saveState(reset);
    return reset;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** ---------- Sprite logic ----------
 *  For now this uses Pokémon Showdown sprites.
 *  If Roria has custom forms/sprites, you can swap `spriteUrl()` to your own assets.
 */
function toShowdownId(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^$/, "");
}

// Showdown sprite endpoints (client-side friendly)
function spriteUrl(species, shiny) {
  const id = toShowdownId(species);
  if (!id) return "";
  // Gen 9 style sprites (works fine for many mons). If a sprite is missing, you can fallback.
  return shiny
    ? `https://play.pokemonshowdown.com/sprites/gen5ani-shiny/${id}.gif`
    : `https://play.pokemonshowdown.com/sprites/gen5ani/${id}.gif`;
}

/** ---------- UI Elements ---------- */
const els = {
  teamList: document.getElementById("teamList"),
  teamSearch: document.getElementById("teamSearch"),
  teamName: document.getElementById("teamName"),
  formatPill: document.getElementById("formatPill"),
  slotGrid: document.getElementById("slotGrid"),

  newTeamBtn: document.getElementById("newTeamBtn"),
  saveTeamBtn: document.getElementById("saveTeamBtn"),
  deleteTeamBtn: document.getElementById("deleteTeamBtn"),

  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),

  editorHint: document.getElementById("editorHint"),
  editorBody: document.getElementById("editorBody"),

  spriteImg: document.getElementById("spriteImg"),
  shinyToggle: document.getElementById("shinyToggle"),
  speciesInput: document.getElementById("speciesInput"),
  nicknameInput: document.getElementById("nicknameInput"),
  abilityInput: document.getElementById("abilityInput"),
  natureInput: document.getElementById("natureInput"),
  itemInput: document.getElementById("itemInput"),
  move1: document.getElementById("move1"),
  move2: document.getElementById("move2"),
  move3: document.getElementById("move3"),
  move4: document.getElementById("move4"),

  evHP: document.getElementById("evHP"),
  evAtk: document.getElementById("evAtk"),
  evDef: document.getElementById("evDef"),
  evSpA: document.getElementById("evSpA"),
  evSpD: document.getElementById("evSpD"),
  evSpe: document.getElementById("evSpe"),
  evTotal: document.getElementById("evTotal"),

  evHex: document.getElementById("evHex"),
  evBars: document.getElementById("evBars"),

  clearSlotBtn: document.getElementById("clearSlotBtn"),
  applyBtn: document.getElementById("applyBtn"),
};

let state = loadState();
let activeSlotIndex = null;

/** ---------- Helpers ---------- */
function getActiveTeam() {
  return state.teams.find(t => t.id === state.activeTeamId) ?? state.teams[0];
}
function setActiveTeam(id) {
  state.activeTeamId = id;
  activeSlotIndex = null;
  saveState(state);
  renderAll();
}
function clampEV(n) {
  const x = Number.isFinite(n) ? n : parseInt(n, 10);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(252, x));
}
function evTotal(evs) {
  return evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
}

/** ---------- Rendering ---------- */
function renderTeams() {
  const q = (els.teamSearch.value || "").toLowerCase().trim();
  const teams = state.teams
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(t => !q || (t.name || "").toLowerCase().includes(q));

  els.teamList.innerHTML = "";
  teams.forEach(team => {
    const div = document.createElement("div");
    div.className = "team-card" + (team.id === state.activeTeamId ? " active" : "");
    div.innerHTML = `
      <div class="team-card__name">${escapeHtml(team.name || "Untitled")}</div>
      <div class="team-card__meta">
        <span>${escapeHtml(team.format || "Custom")}</span>
        <span>${new Date(team.updatedAt).toLocaleDateString()}</span>
      </div>
    `;
    div.onclick = () => setActiveTeam(team.id);
    els.teamList.appendChild(div);
  });
}

function renderSlots() {
  const team = getActiveTeam();
  els.slotGrid.innerHTML = "";

  team.mons.forEach((mon, idx) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (idx === activeSlotIndex ? " active" : "");
    const sUrl = spriteUrl(mon.species, mon.shiny);
    slot.innerHTML = `
      <img src="${sUrl || ""}" onerror="this.style.opacity=.15" style="opacity:${sUrl ? 1 : .15}" />
      <div class="slot__info">
        <div class="slot__species">${escapeHtml(mon.nickname || mon.species || `Slot ${idx + 1}`)}</div>
        <div class="slot__sub">
          <span>${escapeHtml(mon.species || "—")}</span>
          <span>${escapeHtml(mon.item || "No item")}</span>
          <span>${escapeHtml(mon.nature || "Nature?")}</span>
        </div>
      </div>
    `;
    slot.onclick = () => {
      activeSlotIndex = idx;
      renderSlots();
      openEditorForSlot(idx);
    };
    els.slotGrid.appendChild(slot);
  });
}

function renderHeader() {
  const team = getActiveTeam();
  els.teamName.value = team.name || "";
  els.formatPill.textContent = `Format: ${team.format || "Custom"}`;
}

function renderAll() {
  renderTeams();
  renderHeader();
  renderSlots();
  closeEditor();
}

/** ---------- Editor ---------- */
function openEditorForSlot(idx) {
  const team = getActiveTeam();
  const mon = team.mons[idx];

  els.editorHint.textContent = `Editing slot ${idx + 1}`;
  els.editorBody.classList.remove("hidden");

  els.speciesInput.value = mon.species || "";
  els.nicknameInput.value = mon.nickname || "";
  els.shinyToggle.checked = !!mon.shiny;

  els.abilityInput.value = mon.ability || "";
  els.natureInput.value = mon.nature || "";
  els.itemInput.value = mon.item || "";

  els.move1.value = mon.moves[0] || "";
  els.move2.value = mon.moves[1] || "";
  els.move3.value = mon.moves[2] || "";
  els.move4.value = mon.moves[3] || "";

  els.evHP.value = mon.evs.hp;
  els.evAtk.value = mon.evs.atk;
  els.evDef.value = mon.evs.def;
  els.evSpA.value = mon.evs.spa;
  els.evSpD.value = mon.evs.spd;
  els.evSpe.value = mon.evs.spe;

  updateSpritePreview();
  updateEVDisplays();
  drawEVCharts();
}

function closeEditor() {
  if (activeSlotIndex === null) {
    els.editorHint.textContent = "Select a slot to edit.";
    els.editorBody.classList.add("hidden");
  }
}

function editorToMon() {
  const mon = emptyMon();
  mon.species = els.speciesInput.value.trim();
  mon.nickname = els.nicknameInput.value.trim();
  mon.shiny = els.shinyToggle.checked;
  mon.ability = els.abilityInput.value.trim();
  mon.nature = els.natureInput.value.trim();
  mon.item = els.itemInput.value.trim();
  mon.moves = [
    els.move1.value.trim(),
    els.move2.value.trim(),
    els.move3.value.trim(),
    els.move4.value.trim(),
  ];
  mon.evs = {
    hp: clampEV(els.evHP.value),
    atk: clampEV(els.evAtk.value),
    def: clampEV(els.evDef.value),
    spa: clampEV(els.evSpA.value),
    spd: clampEV(els.evSpD.value),
    spe: clampEV(els.evSpe.value),
  };
  return mon;
}

function updateSpritePreview() {
  const species = els.speciesInput.value.trim();
  const shiny = els.shinyToggle.checked;
  const url = spriteUrl(species, shiny);
  els.spriteImg.src = url || "";
  els.spriteImg.style.opacity = url ? "1" : ".15";
}

function updateEVDisplays() {
  const evs = {
    hp: clampEV(els.evHP.value),
    atk: clampEV(els.evAtk.value),
    def: clampEV(els.evDef.value),
    spa: clampEV(els.evSpA.value),
    spd: clampEV(els.evSpD.value),
    spe: clampEV(els.evSpe.value),
  };
  const total = evTotal(evs);
  els.evTotal.textContent = `Total: ${total} / 510`;
  els.evTotal.style.color = total > 510 ? "var(--danger)" : "var(--muted)";
}

/** ---------- Charts ---------- */
function drawEVCharts() {
  const evs = {
    hp: clampEV(els.evHP.value),
    atk: clampEV(els.evAtk.value),
    def: clampEV(els.evDef.value),
    spa: clampEV(els.evSpA.value),
    spd: clampEV(els.evSpD.value),
    spe: clampEV(els.evSpe.value),
  };

  drawHex(els.evHex, evs);
  drawBars(els.evBars, evs);
}

function drawHex(canvas, evs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // style
  const grid = "rgba(176,108,255,.25)";
  const axis = "rgba(94,243,255,.35)";
  const fill = "rgba(176,108,255,.18)";
  const stroke = "rgba(94,243,255,.65)";
  const text = "rgba(242,234,255,.85)";

  const cx = w / 2;
  const cy = h / 2 + 10;
  const r = Math.min(w, h) * 0.33;

  const labels = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
  const values = [evs.hp, evs.atk, evs.def, evs.spa, evs.spd, evs.spe].map(v => v / 252);

  // grid rings
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4;
    polygon(ctx, cx, cy, rr, 6, -Math.PI / 2, grid, null);
  }
  // axes
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // labels
  ctx.fillStyle = text;
  ctx.font = "12px ui-sans-serif, system-ui";
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const lx = cx + Math.cos(ang) * (r + 18);
    const ly = cy + Math.sin(ang) * (r + 18);
    ctx.fillText(labels[i], lx - 10, ly + 4);
  }

  // value polygon
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const rr = r * values[i];
    const px = cx + Math.cos(ang) * rr;
    const py = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function polygon(ctx, cx, cy, r, sides, rot, strokeStyle, fillStyle) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const ang = rot + (i * 2 * Math.PI) / sides;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBars(canvas, evs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const labels = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
  const values = [evs.hp, evs.atk, evs.def, evs.spa, evs.spd, evs.spe];

  const pad = 18;
  const left = 40;
  const top = 10;
  const barH = 18;
  const gap = 12;
  const maxW = w - left - pad;

  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(242,234,255,.85)";

  for (let i = 0; i < 6; i++) {
    const y = top + i * (barH + gap);
    ctx.fillText(labels[i], 8, y + 13);

    const ratio = Math.min(1, values[i] / 252);
    const bw = maxW * ratio;

    // background
    ctx.fillStyle = "rgba(176,108,255,.14)";
    ctx.fillRect(left, y, maxW, barH);

    // fill
    ctx.fillStyle = "rgba(94,243,255,.55)";
    ctx.fillRect(left, y, bw, barH);

    // border
    ctx.strokeStyle = "rgba(176,108,255,.35)";
    ctx.strokeRect(left, y, maxW, barH);

    // value text
    ctx.fillStyle = "rgba(242,234,255,.85)";
    ctx.fillText(String(values[i]), left + maxW + 6 - 22, y + 13);
  }
}

/** ---------- Actions ---------- */
els.newTeamBtn.onclick = () => {
  const t = newTeam();
  state.teams.unshift(t);
  state.activeTeamId = t.id;
  activeSlotIndex = null;
  saveState(state);
  renderAll();
};

els.saveTeamBtn.onclick = () => {
  const team = getActiveTeam();
  team.name = els.teamName.value.trim() || "Untitled";
  team.updatedAt = Date.now();
  saveState(state);
  renderAll();
};

els.deleteTeamBtn.onclick = () => {
  if (state.teams.length <= 1) {
    alert("You must keep at least one team.");
    return;
  }
  const team = getActiveTeam();
  state.teams = state.teams.filter(t => t.id !== team.id);
  state.activeTeamId = state.teams[0].id;
  activeSlotIndex = null;
  saveState(state);
  renderAll();
};

els.teamSearch.addEventListener("input", renderTeams);
els.teamName.addEventListener("input", () => {
  // live update name (optional)
  const team = getActiveTeam();
  team.name = els.teamName.value;
  team.updatedAt = Date.now();
  saveState(state);
  renderTeams();
});

els.exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "roria-teams.json";
  a.click();
  URL.revokeObjectURL(url);
};

els.importBtn.onclick = () => els.importFile.click();
els.importFile.onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = JSON.parse(text);
    if (!imported.teams?.length) throw new Error("No teams found");
    state = imported;
    // ensure active id
    if (!state.activeTeamId) state.activeTeamId = state.teams[0].id;
    activeSlotIndex = null;
    saveState(state);
    renderAll();
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    els.importFile.value = "";
  }
};

els.shinyToggle.addEventListener("change", () => {
  updateSpritePreview();
});

[
  els.speciesInput,
  els.nicknameInput,
  els.abilityInput,
  els.natureInput,
  els.itemInput,
  els.move1, els.move2, els.move3, els.move4,
].forEach(el => el.addEventListener("input", () => {
  updateSpritePreview();
}));

[
  els.evHP, els.evAtk, els.evDef, els.evSpA, els.evSpD, els.evSpe
].forEach(el => el.addEventListener("input", () => {
  updateEVDisplays();
  drawEVCharts();
}));

els.clearSlotBtn.onclick = () => {
  if (activeSlotIndex === null) return;
  const team = getActiveTeam();
  team.mons[activeSlotIndex] = emptyMon();
  team.updatedAt = Date.now();
  saveState(state);
  renderAll();
  activeSlotIndex = null;
  closeEditor();
};

els.applyBtn.onclick = () => {
  if (activeSlotIndex === null) return;
  const team = getActiveTeam();
  team.mons[activeSlotIndex] = editorToMon();
  team.updatedAt = Date.now();
  saveState(state);
  renderAll();
};

function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

/** ---------- Init ---------- */
renderAll();
updateEVDisplays();
drawEVCharts();
