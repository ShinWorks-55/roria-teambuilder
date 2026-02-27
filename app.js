/* ==========================================================
  Roria Team Builder (GitHub Pages)
  - Multi-team saves (localStorage)
  - Showdown sprites + shiny toggle
  - Autocomplete via datalist (species/items/abilities/moves/natures)
  - EV limits enforced (252 per stat, 510 total)
  - EV hex + EV bar chart
  - Evaluation panel with S/A/B/C/D/F using Smogon usage stats
  Data sources:
   - Pokémon Showdown data (pokedex/moves/items/abilities)
   - pkmn smogon stats API (usage)
========================================================== */

const STORAGE_KEY = "roria_teambuilder_v2";

/** ---------- UI Elements ---------- */
const els = {
  teamList: document.getElementById("teamList"),
  teamSearch: document.getElementById("teamSearch"),
  teamName: document.getElementById("teamName"),
  formatPill: document.getElementById("formatPill"),
  formatSelect: document.getElementById("formatSelect"),
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

  toggleEvalBtn: document.getElementById("toggleEvalBtn"),
  evalBody: document.getElementById("evalBody"),
};

const DATALISTS = {
  species: document.getElementById("dl-species"),
  items: document.getElementById("dl-items"),
  abilities: document.getElementById("dl-abilities"),
  moves: document.getElementById("dl-moves"),
  natures: document.getElementById("dl-natures"),
};

/** ---------- Data ---------- */
const DATA = {
  pokedex: null,
  moves: null,
  items: null,
  abilities: null,
  ready: false,
};

const STATS_CACHE = new Map();

/** ---------- Model ---------- */
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
    format: "gen9ou",
    mons: [emptyMon(), emptyMon(), emptyMon(), emptyMon(), emptyMon(), emptyMon()],
    updatedAt: Date.now(),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const init = { teams: [newTeam()], activeTeamId: null };
    init.activeTeamId = init.teams[0].id;
    saveState(init);
    return init;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.teams?.length) throw new Error("bad state");
    if (!parsed.activeTeamId) parsed.activeTeamId = parsed.teams[0].id;
    // backfill missing format
    parsed.teams.forEach(t => { if (!t.format) t.format = "gen9ou"; });
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

let state = loadState();
let activeSlotIndex = null;
let evalHidden = false;

/** ---------- Utilities ---------- */
function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function toShowdownId(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^$/, "");
}

function spriteUrl(species, shiny) {
  const id = toShowdownId(species);
  if (!id) return "";
  return shiny
    ? `https://play.pokemonshowdown.com/sprites/gen5ani-shiny/${id}.gif`
    : `https://play.pokemonshowdown.com/sprites/gen5ani/${id}.gif`;
}

function clampEV(n) {
  const x = Number.isFinite(n) ? n : parseInt(n, 10);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(252, x));
}

function evTotal(evs) {
  return evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
}

function getActiveTeam() {
  return state.teams.find(t => t.id === state.activeTeamId) ?? state.teams[0];
}

function setActiveTeam(id) {
  state.activeTeamId = id;
  activeSlotIndex = null;
  saveState(state);
  renderAll();
}

/** ---------- Autocomplete data load ---------- */
function setDatalistOptions(dlEl, options) {
  dlEl.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    dlEl.appendChild(o);
  }
}

async function loadShowdownData() {
  const [pokedex, moves] = await Promise.all([
    fetch("https://play.pokemonshowdown.com/data/pokedex.json").then(r => r.json()),
    fetch("https://play.pokemonshowdown.com/data/moves.json").then(r => r.json()),
  ]);

  const [itemsJs, abilitiesJs] = await Promise.all([
    fetch("https://play.pokemonshowdown.com/data/items.js").then(r => r.text()),
    fetch("https://play.pokemonshowdown.com/data/abilities.js").then(r => r.text()),
  ]);

  // Parse CommonJS exports safely
  const items = new Function("exports", `${itemsJs}; return exports.BattleItems;`)({});
  const abilities = new Function("exports", `${abilitiesJs}; return exports.BattleAbilities;`)({});

  DATA.pokedex = pokedex;
  DATA.moves = moves;
  DATA.items = items;
  DATA.abilities = abilities;
  DATA.ready = true;

  const speciesNames = Object.values(pokedex).map(x => x.name).sort((a,b)=>a.localeCompare(b));
  const moveNames = Object.values(moves).map(x => x.name).sort((a,b)=>a.localeCompare(b));
  const itemNames = Object.values(items).map(x => x.name).sort((a,b)=>a.localeCompare(b));
  const abilityNames = Object.values(abilities).map(x => x.name).sort((a,b)=>a.localeCompare(b));

  const natures = [
    "Adamant","Bashful","Bold","Brave","Calm","Careful","Docile","Gentle","Hardy","Hasty",
    "Impish","Jolly","Lax","Lonely","Mild","Modest","Naive","Naughty","Quiet","Quirky",
    "Rash","Relaxed","Sassy","Serious","Timid"
  ];

  setDatalistOptions(DATALISTS.species, speciesNames);
  setDatalistOptions(DATALISTS.moves, moveNames);
  setDatalistOptions(DATALISTS.items, itemNames);
  setDatalistOptions(DATALISTS.abilities, abilityNames);
  setDatalistOptions(DATALISTS.natures, natures);
}

/** ---------- EV rules enforcement ---------- */
function enforceEVLimits(changedKey) {
  const keys = ["hp","atk","def","spa","spd","spe"];
  const inputs = {
    hp: els.evHP, atk: els.evAtk, def: els.evDef,
    spa: els.evSpA, spd: els.evSpD, spe: els.evSpe,
  };

  for (const k of keys) inputs[k].value = clampEV(inputs[k].value);

  let total = keys.reduce((s,k)=>s + Number(inputs[k].value), 0);
  if (total <= 510) return;

  const over = total - 510;
  const cur = Number(inputs[changedKey].value);
  inputs[changedKey].value = Math.max(0, cur - over);
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
        <span>${escapeHtml(team.format || "gen9ou")}</span>
        <span>${new Date(team.updatedAt).toLocaleDateString()}</span>
      </div>
    `;
    div.onclick = () => setActiveTeam(team.id);
    els.teamList.appendChild(div);
  });
}

function renderHeader() {
  const team = getActiveTeam();
  els.teamName.value = team.name || "";
  els.formatSelect.value = team.format || "gen9ou";
  els.formatPill.textContent = `Format: ${prettyFormat(team.format || "gen9ou")}`;
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

async function renderAll() {
  renderTeams();
  renderHeader();
  renderSlots();
  closeEditor();
  await renderEvaluation();
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

function prettyFormat(formatId) {
  const m = {
    gen9ou: "Gen 9 OU",
    gen9uu: "Gen 9 UU",
    gen9ubers: "Gen 9 Ubers",
    gen9anythinggoes: "Gen 9 Anything Goes",
  };
  return m[formatId] || formatId;
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
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawHex(canvas, evs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

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

  for (let ring = 1; ring <= 4; ring++) {
    polygon(ctx, cx, cy, (r * ring) / 4, 6, -Math.PI / 2, grid, null);
  }

  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = text;
  ctx.font = "12px ui-sans-serif, system-ui";
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const lx = cx + Math.cos(ang) * (r + 18);
    const ly = cy + Math.sin(ang) * (r + 18);
    ctx.fillText(labels[i], lx - 10, ly + 4);
  }

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

    ctx.fillStyle = "rgba(176,108,255,.14)";
    ctx.fillRect(left, y, maxW, barH);

    ctx.fillStyle = "rgba(94,243,255,.55)";
    ctx.fillRect(left, y, bw, barH);

    ctx.strokeStyle = "rgba(176,108,255,.35)";
    ctx.strokeRect(left, y, maxW, barH);

    ctx.fillStyle = "rgba(242,234,255,.85)";
    ctx.fillText(String(values[i]), left + maxW + 6 - 22, y + 13);
  }
}

/** ---------- Evaluation (data-driven) ---------- */
async function loadFormatStats(formatId) {
  if (STATS_CACHE.has(formatId)) return STATS_CACHE.get(formatId);
  const url = `https://pkmn.github.io/smogon/data/stats/${formatId}.json`;
  const data = await fetch(url).then(r => r.json());
  STATS_CACHE.set(formatId, data);
  return data;
}

function gradeFromPercentile(p) {
  if (p >= 0.95) return "S";
  if (p >= 0.85) return "A";
  if (p >= 0.70) return "B";
  if (p >= 0.50) return "C";
  if (p >= 0.30) return "D";
  return "F";
}

function topK(mapObj, k=3) {
  if (!mapObj) return [];
  return Object.entries(mapObj)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,k)
    .map(([name, val]) => ({ name, val }));
}

function computeOverall(mon, usagePercentile) {
  const id = toShowdownId(mon.species);
  const dexEntry = DATA.pokedex?.[id];
  if (!dexEntry) return { overall: "C" };

  const bs = dexEntry.baseStats;
  const bulk = (bs.hp + bs.def + bs.spd) / (255+230+230);
  const power = Math.max(bs.atk, bs.spa) / 180;
  const speed = bs.spe / 200;

  const score = 0.55 * usagePercentile + 0.20 * bulk + 0.15 * power + 0.10 * speed;
  return { overall: gradeFromPercentile(score) };
}

async function renderEvaluation() {
  const team = getActiveTeam();
  if (evalHidden) return;

  els.evalBody.innerHTML = `<div class="muted">Loading evaluation…</div>`;

  let stats = null;
  try {
    stats = await loadFormatStats(team.format || "gen9ou");
  } catch (e) {
    els.evalBody.innerHTML = `<div class="muted">Evaluation unavailable (stats fetch failed).</div>`;
    return;
  }

  const pokemonStats = stats?.pokemon || {};
  const allIds = Object.keys(pokemonStats);

  const ranked = allIds
    .map(id => ({ id, usage: pokemonStats[id]?.usage ?? 0 }))
    .sort((a,b)=>b.usage - a.usage);

  const rankIndex = new Map(ranked.map((x,i)=>[x.id, i]));
  const n = ranked.length;

  els.evalBody.innerHTML = "";

  let any = false;

  for (const mon of team.mons) {
    if (!mon.species) continue;
    any = true;

    const id = toShowdownId(mon.species);
    const r = rankIndex.has(id) ? rankIndex.get(id) : null;
    const usagePercentile = (r === null) ? 0.35 : 1 - (r / Math.max(1,(n-1)));
    const usageGrade = gradeFromPercentile(usagePercentile);

    const overallObj = computeOverall(mon, usagePercentile);
    const overall = overallObj.overall;

    const entry = pokemonStats[id];
    const items = topK(entry?.items, 2).map(x=>x.name);
    const moves = topK(entry?.moves, 3).map(x=>x.name);
    const abilities = topK(entry?.abilities, 1).map(x=>x.name);

    const name = (mon.nickname || mon.species).trim();

    let line = `${name}: looks fine — keep an eye on matchups and speed control.`;
    if (items.length && (!mon.item || toShowdownId(mon.item) !== toShowdownId(items[0]))) {
      line = `${name}: good pick — consider ${items[0]} (very common in ${prettyFormat(team.format)}).`;
    } else if (moves.length) {
      const currentMoves = mon.moves.map(m=>toShowdownId(m));
      const bestMove = moves.find(m => !currentMoves.includes(toShowdownId(m)));
      if (bestMove) line = `${name}: solid — a common upgrade is adding ${bestMove}.`;
    } else {
      line = `${name}: stats data is limited for this pick in ${prettyFormat(team.format)}.`;
    }

    const sprite = spriteUrl(mon.species, mon.shiny);

    const row = document.createElement("div");
    row.className = "eval-row";
    row.innerHTML = `
      <img src="${sprite}" onerror="this.style.opacity=.15" style="opacity:${sprite?1:.15}" />
      <div class="eval-text">
        <div class="eval-line">${escapeHtml(line)}</div>
        <div class="eval-sub">
          Usage: <b>${usageGrade}</b> · Overall: <b>${overall}</b>
          ${abilities.length ? ` · Common ability: <b>${escapeHtml(abilities[0])}</b>` : ""}
          ${items.length ? ` · Common item: <b>${escapeHtml(items[0])}</b>` : ""}
        </div>
      </div>
      <div class="badge badge--${overall}">${overall}</div>
    `;
    els.evalBody.appendChild(row);
  }

  if (!any) {
    els.evalBody.innerHTML = `<div class="muted">Add Pokémon to your team to see an evaluation.</div>`;
  }
}

/** ---------- Events ---------- */
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
  const team = getActiveTeam();
  team.name = els.teamName.value;
  team.updatedAt = Date.now();
  saveState(state);
  renderTeams();
});

els.formatSelect.addEventListener("change", () => {
  const team = getActiveTeam();
  team.format = els.formatSelect.value;
  team.updatedAt = Date.now();
  saveState(state);
  renderAll();
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
    if (!state.activeTeamId) state.activeTeamId = state.teams[0].id;
    state.teams.forEach(t => { if (!t.format) t.format = "gen9ou"; });
    activeSlotIndex = null;
    saveState(state);
    renderAll();
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    els.importFile.value = "";
  }
};

els.toggleEvalBtn.onclick = () => {
  evalHidden = !evalHidden;
  els.evalBody.style.display = evalHidden ? "none" : "flex";
  els.toggleEvalBtn.textContent = evalHidden ? "Show evaluation" : "Hide evaluation";
  if (!evalHidden) renderEvaluation();
};

els.shinyToggle.addEventListener("change", updateSpritePreview);

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

els.evHP.addEventListener("input", () => { enforceEVLimits("hp"); updateEVDisplays(); drawEVCharts(); });
els.evAtk.addEventListener("input", () => { enforceEVLimits("atk"); updateEVDisplays(); drawEVCharts(); });
els.evDef.addEventListener("input", () => { enforceEVLimits("def"); updateEVDisplays(); drawEVCharts(); });
els.evSpA.addEventListener("input", () => { enforceEVLimits("spa"); updateEVDisplays(); drawEVCharts(); });
els.evSpD.addEventListener("input", () => { enforceEVLimits("spd"); updateEVDisplays(); drawEVCharts(); });
els.evSpe.addEventListener("input", () => { enforceEVLimits("spe"); updateEVDisplays(); drawEVCharts(); });

els.clearSlotBtn.onclick = () => {
  if (activeSlotIndex === null) return;
  const team = getActiveTeam();
  team.mons[activeSlotIndex] = emptyMon();
  team.updatedAt = Date.now();
  saveState(state);
  activeSlotIndex = null;
  renderAll();
};

els.applyBtn.onclick = () => {
  if (activeSlotIndex === null) return;
  const team = getActiveTeam();
  team.mons[activeSlotIndex] = editorToMon();
  team.updatedAt = Date.now();
  saveState(state);
  renderAll();
};

/** ---------- Init ---------- */
(async () => {
  renderAll();
  updateEVDisplays();
  drawEVCharts();

  try {
    await loadShowdownData();
    // re-render evaluation once dex is ready (for overall grade using base stats)
    await renderEvaluation();
  } catch (e) {
    console.warn("Showdown data load failed:", e);
  }
})();
