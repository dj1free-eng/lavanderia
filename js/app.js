import { addToQueue, getQueue, deleteQueueItems, clearQueue, queueCount } from "./db.js";

const PRODUCTS = [
  "Caminos",
  "Servilletas",
  "Mantel",
  "San. Ind.",
  "Vanob. Ind.",
  "King rayas",
  "King lisas",
  "Sab. Cuna",
  "Cuadrantes",
  "Fund. Almohada",
  "Extra (mezcla)"
];

const SUCIO_CATS = ["SÁBANAS", "SERVILLETAS", "CAMINOS", "MANTELES"];
const LAV_TIPOS = ["BLANCA", "PISCINA", "VARIOS"];

const el = (id) => document.getElementById(id);
const log = (msg) => {
  const box = el("log");
  if (!box) return;
  box.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + box.textContent;
};

function isoDate(d) {
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOff).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtKg(x) {
  const v = Math.round((x || 0) * 10) / 10;
  return v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kg";
}

function setNetBadge() {
  const on = navigator.onLine;
  const b = el("netBadge");
  if (!b) return;
  b.textContent = on ? "Online" : "Offline";
  b.classList.toggle("badge-ok", on);
  b.classList.toggle("badge-bad", !on);
  b.classList.toggle("badge-muted", false);
}

async function refreshQueueBadge() {
  const c = await queueCount();
  const qb = el("queueBadge");
  if (!qb) return;
  qb.textContent = `Cola: ${c}`;
}

function showHome() {
  document.getElementById("homeScreen")?.classList.remove("hidden");
  document.getElementById("appScreen")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("homeScreen")?.classList.add("hidden");
  document.getElementById("appScreen")?.classList.remove("hidden");
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(s => {
    s.classList.toggle("hidden", s.getAttribute("data-tab") !== name);
  });
  document.querySelectorAll(".tabbtn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-go") === name);
  });
}

function updateFechaUI() {
  const fb = el("fechaBase")?.value || "—";
  const out = document.getElementById("uiFechaBase");
  if (out) out.textContent = fb;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[m]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/* ---------- UI: Lavadoras ---------- */

function buildLavInputs() {
  document.querySelectorAll(".lav").forEach((box) => {
    const tipo = box.getAttribute("data-tipo");
    box.innerHTML = ["55", "24", "13", "8"].map((k) => `
      <div class="cell">
        <label>${k} kg</label>
        <input type="number" step="1" inputmode="numeric" min="0" value="0" data-tipo="${tipo}" data-size="${k}">
      </div>
    `).join("");
  });
}

function recalcLavadoTotals() {
  const inputs = [...document.querySelectorAll(".lav input")];
  const counts = {
    BLANCA: { 55: 0, 24: 0, 13: 0, 8: 0 },
    PISCINA: { 55: 0, 24: 0, 13: 0, 8: 0 },
    VARIOS: { 55: 0, 24: 0, 13: 0, 8: 0 }
  };

  for (const i of inputs) {
    const tipo = i.dataset.tipo;
    const size = Number(i.dataset.size);
    counts[tipo][size] = num(i.value);
  }

  const kg = (tipo) =>
    counts[tipo][55] * 55 +
    counts[tipo][24] * 24 +
    counts[tipo][13] * 13 +
    counts[tipo][8] * 8;

  const kB = kg("BLANCA");
  const kP = kg("PISCINA");
  const kV = kg("VARIOS");

  el("kgBlanca").textContent = Math.round(kB) + " kg";
  el("kgPiscina").textContent = Math.round(kP) + " kg";
  el("kgVarios").textContent = Math.round(kV) + " kg";
  el("kgHotel").textContent = Math.round(kB + kP + kV) + " kg";

  return { counts, kB, kP, kV };
}

/* ---------- UI: Jaulas / Tickets ---------- */

const state = {
  jaulas: [],
  tickets: []
};

function jaulaItemTemplate(data) {
  const { id, categoria, numJaula, bruto, tara } = data;
  const neto = Math.max(0, num(bruto) - num(tara ?? 42));

  return `
    <div class="line-item" data-id="${id}">
      <div class="line-left">
        <div class="line-title">Jaula ${escapeHtml(numJaula || "—")} · ${escapeHtml(categoria || "SÁBANAS")}</div>
        <div class="line-sub">Bruto: ${fmtKg(num(bruto))} · Tara: ${fmtKg(num(tara ?? 42))}</div>
      </div>

      <div class="line-right">
        <div class="line-kg">${fmtKg(neto)}</div>
        <button class="iconbtn" data-action="del" type="button">×</button>
      </div>
    </div>
  `;
}
function ticketItemTemplate(data) {
  const { id, producto, unidades } = data;
  return `
  <div class="item" data-id="${id}">
    <div class="item-top">
      <div class="item-title">Ticket · ${escapeHtml(producto || "—")}</div>
      <div class="item-actions">
        <button class="iconbtn" data-action="del">×</button>
      </div>
    </div>

    <div class="grid2">
      <div class="row">
        <label class="label">Producto</label>
        <select data-field="producto">
          ${PRODUCTS.map(p => `<option ${p === producto ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>

      <div class="row">
        <label class="label">Unidades</label>
        <input type="number" step="1" inputmode="numeric" value="${escapeAttr(unidades ?? "")}" data-field="unidades" placeholder="0" />
      </div>
    </div>
  </div>`;
}

function recalcJaulasTotals() {
  let sab = 0, mant = 0, total = 0;

  for (const j of state.jaulas) {
    const neto = Math.max(0, num(j.bruto) - num(j.tara ?? 42));
    total += neto;
    if (j.categoria === "SÁBANAS") sab += neto;
    else mant += neto;
  }

  el("totSab").textContent = fmtKg(sab);
  el("totMant").textContent = fmtKg(mant);
  el("totSuci").textContent = fmtKg(total);
}

function renderJaulas() {
  const list = el("jaulasList");
  list.innerHTML = state.jaulas.map(jaulaItemTemplate).join("");
  recalcJaulasTotals();
}

function renderTickets() {
  const list = el("ticketsList");
  list.innerHTML = state.tickets.map(ticketItemTemplate).join("");
}

function getJaulaForm() {
  return {
    numJaula: (el("jNumJaula")?.value || "").trim(),
    categoria: el("jCategoria")?.value || "SÁBANAS",
    bruto: el("jBruto")?.value,
    tara: el("jTara")?.value
  };
}

function setJaulaForm(values) {
  if (values.numJaula !== undefined) el("jNumJaula").value = values.numJaula;
  if (values.categoria !== undefined) el("jCategoria").value = values.categoria;
  if (values.bruto !== undefined) el("jBruto").value = values.bruto;
  if (values.tara !== undefined) el("jTara").value = values.tara;
}

function updateJaulaPreview() {
  const f = getJaulaForm();
  const neto = Math.max(0, num(f.bruto) - num(f.tara ?? 42));
  const out = el("jNetoPreview");
  if (out) out.textContent = fmtKg(neto);
}

function addJaula() {
  const f = getJaulaForm();

  if (!f.bruto || String(f.bruto).trim() === "") {
    log("No añadida: falta el peso bruto.");
    return;
  }

  state.jaulas.push({
    id: crypto.randomUUID(),
    categoria: f.categoria || "SÁBANAS",
    numJaula: f.numJaula || "",
    bruto: num(f.bruto),
    tara: num(f.tara ?? 42)
  });

  renderJaulas();

  // Limpiar para la siguiente entrada (modo captura rápida)
  setJaulaForm({ numJaula: "", bruto: "" });
  updateJaulaPreview();

  // Poner el cursor de vuelta en Nº jaula para ir rápido
  el("jNumJaula")?.focus();
}

function addTicket() {
  state.tickets.push({
    id: crypto.randomUUID(),
    producto: "San. Ind.",
    unidades: ""
  });
  renderTickets();
}

function bindListEvents() {
  // JAULAS: solo borrar (ya no se editan en la lista)
  el("jaulasList").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;

    const row = ev.target.closest(".line-item");
    if (!row) return;

    if (btn.dataset.action === "del") {
      state.jaulas = state.jaulas.filter(x => x.id !== row.dataset.id);
      renderJaulas();
    }
  });

  // TICKETS: se quedan como estaban (por ahora)
  el("ticketsList").addEventListener("input", (ev) => {
    const item = ev.target.closest(".item");
    if (!item) return;

    const id = item.dataset.id;
    const t = state.tickets.find(x => x.id === id);
    if (!t) return;

    const field = ev.target.dataset.field;
    if (!field) return;

    if (field === "producto") t.producto = ev.target.value;
    if (field === "unidades") t.unidades = ev.target.value;
  });

  el("ticketsList").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;

    const item = ev.target.closest(".item");
    if (!item) return;

    if (btn.dataset.action === "del") {
      state.tickets = state.tickets.filter(x => x.id !== item.dataset.id);
      renderTickets();
    }
  });
}
/* ---------- Config (URL + Token) ---------- */

function loadCfg() {
  const raw = localStorage.getItem("lav_cfg");
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    if (cfg.url) el("cfgUrl").value = cfg.url;
    if (cfg.token) el("cfgToken").value = cfg.token;
  } catch { /* ignore */ }
}

function saveCfg() {
  const url = el("cfgUrl").value.trim();
  const token = el("cfgToken").value.trim();
  localStorage.setItem("lav_cfg", JSON.stringify({ url, token }));
  log("Ajustes guardados.");
}

function getCfg() {
  const raw = localStorage.getItem("lav_cfg");
  if (!raw) return { url: "", token: "" };
  try { return JSON.parse(raw) || { url: "", token: "" }; }
  catch { return { url: "", token: "" }; }
}

/* ---------- Guardar offline + Sync ---------- */

function validateParte() {
  const fb = el("fechaBase").value;
  if (!fb) return { ok: false, msg: "Falta fecha base." };

  for (const j of state.jaulas) {
    if (String(j.bruto).trim() === "") return { ok: false, msg: "Hay una jaula sin peso bruto." };
    if (!j.categoria) return { ok: false, msg: "Hay una jaula sin categoría." };
  }

  for (const t of state.tickets) {
    if (String(t.unidades).trim() === "") return { ok: false, msg: "Hay una línea de ticket sin unidades." };
  }

  return { ok: true, msg: "OK" };
}

async function guardarParteOffline() {
  const v = validateParte();
  if (!v.ok) { log("No guardado: " + v.msg); return; }

  const fechaBase = el("fechaBase").value;
  const nota = el("notaParte").value.trim();

  const items = [];

const partId = crypto.randomUUID();
const createdAt = Date.now();
let seq = 0;

const mkId = () => `${partId}:${++seq}`;

  // SUCIO_JAULAS (fecha_evento = hoy)
  for (const j of state.jaulas) {
items.push({
  id: mkId(),
  createdAt,
  fecha_base: fechaBase,
      evento: "SUCIO_JAULAS",
      categoria: j.categoria,
      detalle: j.numJaula || "",
      unidades: "",
      kg_bruto: num(j.bruto),
      tara_kg: num(j.tara ?? 42),
      kg_neto: Math.max(0, num(j.bruto) - num(j.tara ?? 42)),
      n55: "", n24: "", n13: "", n8: "",
      nota
    });
  }

  // TICKET_UNIDADES (fecha_evento = mañana)
  const fechaTickets = addDays(fechaBase, 1);
  for (const t of state.tickets) {
    items.push({
  id: mkId(),
  createdAt,
  fecha_base: fechaBase,
      fecha_evento: fechaTickets,
      evento: "TICKET_UNIDADES",
      categoria: "",
      detalle: t.producto,
      unidades: num(t.unidades),
      kg_bruto: "", tara_kg: "", kg_neto: "",
      n55: "", n24: "", n13: "", n8: "",
      nota
    });
  }

  // EXTRA_BOLSAS (fecha_evento = pasado mañana)
  const extra = el("extraKg").value.trim();
  if (extra !== "") {
    const fechaExtra = addDays(fechaBase, 2);
    items.push({
  id: mkId(),
  createdAt,
  fecha_base: fechaBase,
      fecha_evento: fechaExtra,
      evento: "EXTRA_BOLSAS",
      categoria: "",
      detalle: "Extra (mezcla)",
      unidades: "",
      kg_bruto: "", tara_kg: "", kg_neto: num(extra),
      n55: "", n24: "", n13: "", n8: "",
      nota
    });
  }

  // LAVADO_HOTEL (fecha_evento = hoy)
  const { counts } = recalcLavadoTotals();
  for (const tipo of LAV_TIPOS) {
    const c = counts[tipo];
    const hasAny = (c[55] || c[24] || c[13] || c[8]) > 0;
    if (!hasAny) continue;

    items.push({
  id: mkId(),
  createdAt,
  fecha_base: fechaBase,
      fecha_evento: fechaBase,
      evento: "LAVADO_HOTEL",
      categoria: tipo,
      detalle: "",
      unidades: "",
      kg_bruto: "", tara_kg: "", kg_neto: "",
      n55: c[55], n24: c[24], n13: c[13], n8: c[8],
      nota
    });
  }

  // PISCINA_CONTROL (fecha_evento = hoy) con unidades
  const dob = el("pDob").value.trim();
  const sub = el("pSub").value.trim();
  const sto = el("pSto").value.trim();

  const addPC = (key, val) => items.push({
  id: mkId(),
  createdAt,
  fecha_base: fechaBase,
    fecha_evento: fechaBase,
    evento: "PISCINA_CONTROL",
    categoria: "",
    detalle: key, // DOBLADAS / SUBIDAS / STOCK
    unidades: num(val),
    kg_bruto: "", tara_kg: "", kg_neto: "",
    n55: "", n24: "", n13: "", n8: "",
    nota
  });

  if (dob !== "") addPC("DOBLADAS", dob);
  if (sub !== "") addPC("SUBIDAS", sub);
  if (sto !== "") addPC("STOCK", sto);

  await addToQueue(items);
  log(`Parte guardado offline. Filas en cola: ${items.length}`);
  await refreshQueueBadge();
  flashSuccess(el("btnGuardarParte"));
}

async function syncNow() {
  const cfg = getCfg();
  if (!cfg.url || !cfg.token) {
    log("Configura URL y Token antes de sincronizar.");
    return;
  }

  const q = await getQueue(500);
  if (!q.length) {
    log("Cola vacía. Nada que sincronizar.");
    return;
  }

  const payload = JSON.stringify({
    token: cfg.token,
    rows: q.map(x => x.payload)
  });

  log(`Enviando ${q.length} filas...`);

  let sent = false;

  // 1) Mejor opción en iOS/PWA: sendBeacon
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        cfg.url,
        new Blob([payload], { type: "text/plain;charset=utf-8" })
      );
      if (ok) {
        sent = true;
        uiMarkSent();
      }
    }
  } catch (e) {
    // seguimos al fallback
  }

  // 2) Fallback: fetch no-cors (envía pero no permite leer respuesta)
  if (!sent) {
    try {
      await fetch(cfg.url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload
      });
      sent = true;
      uiMarkSent();
    } catch (e) {
      log("Sync falló: " + (e?.message || String(e)));
    }
  }

  if (!sent) {
    log("No se pudo enviar (fallo real de red).");
    return;
  }

  log("Enviado. Ahora abre el Sheet y verifica que entraron filas en BD_REGISTROS.");
  log("Si entraron, vuelve aquí y pulsa 'Vaciar cola' para evitar duplicados.");
flashSuccess(el("btnSync"));

}

async function exportQueue() {
  const q = await getQueue(2000);
  const blob = new Blob([JSON.stringify(q.map(x => x.payload), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lavanderia_queue_${isoDate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log("Exportada cola a JSON.");
}

async function clearQueueConfirm() {
  const ok = confirm("¿Seguro que quieres vaciar la cola offline? Se perderán datos no sincronizados.");
  if (!ok) return;
  await clearQueue();
  await refreshQueueBadge();
  log("Cola vaciada.");
}

/* ---------- SW + Init ---------- */

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => { /* ignore */ });
}

function initDate() {
  el("fechaBase").value = isoDate(new Date());
}

function bindUI() {
    // Jaulas: preview neto + tara rápida
  el("jBruto")?.addEventListener("input", updateJaulaPreview);
  el("jTara")?.addEventListener("input", updateJaulaPreview);
  el("jCategoria")?.addEventListener("change", updateJaulaPreview);
  el("btnTara42")?.addEventListener("click", () => {
    el("jTara").value = "42";
    updateJaulaPreview();
  });
  el("btnAddJaula").addEventListener("click", addJaula);
  el("btnAddTicket").addEventListener("click", addTicket);
el("btnGuardarParte").addEventListener(
  "click",
  withButtonFeedback(el("btnGuardarParte"), guardarParteOffline)
);
el("btnSync").addEventListener(
  "click",
  withButtonFeedback(el("btnSync"), syncNow)
);
  el("btnSaveCfg").addEventListener("click", saveCfg);
  el("btnExport").addEventListener("click", exportQueue);


  document.addEventListener("input", (ev) => {
    if (ev.target.matches(".lav input")) recalcLavadoTotals();
  });

  window.addEventListener("online", () => { setNetBadge(); log("Online."); });
  window.addEventListener("offline", () => { setNetBadge(); log("Offline."); });

  // Home -> App
  el("btnStart")?.addEventListener("click", () => {
  updateFechaUI();

  // Inicialización REAL de la app
  buildLavInputs();
  addTicket();
  updateJaulaPreview();
  recalcLavadoTotals();

  showApp();
  setActiveTab("sucio");
});

  // Volver a Home (cambiar fecha)
  el("btnGoHome")?.addEventListener("click", () => {
    showHome();
  });

  // Tabs
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-go");
      setActiveTab(t);
    });
  });

  // Si cambias fecha, refresca cabecera
  el("fechaBase")?.addEventListener("change", updateFechaUI);

}

(async function main() {
  setNetBadge();
  bindListEvents();
  bindUI();
  initDate();
  updateFechaUI();
  showHome();
  loadCfg();
  await refreshQueueBadge();
  registerSW();

  log("Listo. Pulsa Empezar para comenzar.");
})();
// ===== UI Estado + Historial + Acciones seguras (Paquete 2) =====
const UI_STATE_KEY = "lavanderia_ui_state_v1";

function uiLoadState() {
  try { return JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}"); }
  catch { return {}; }
}
function uiSaveState(patch) {
  const cur = uiLoadState();
  const next = Object.assign({}, cur, patch);
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  return next;
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function netLabel() {
  return navigator.onLine ? "Online" : "Offline";
}

async function safeQueueCount() {
  try {
    if (typeof queueCount === "function") return await queueCount();
  } catch {}
  return null;
}

async function safeGetQueue(limit = 50) {
  try {
    if (typeof getQueue === "function") return await getQueue(limit);
  } catch {}
  return [];
}

async function safeClearQueue() {
  try {
    if (typeof clearQueue === "function") return await clearQueue();
  } catch {}
  return false;
}

async function uiRefreshStatus() {
  setText("uiNet", netLabel());

  const n = await safeQueueCount();
  setText("uiQueue", (n === null) ? "?" : String(n));

  const st = uiLoadState();
  setText("uiLastSent", st.lastSentAt ? fmtTime(st.lastSentAt) : "—");
  setText("uiVerify", st.pendingVerify ? "Pendiente" : "OK");
}

function uiMarkSent() {
  uiSaveState({ lastSentAt: Date.now(), pendingVerify: true });
  uiRefreshStatus();
}

function uiMarkVerified() {
  uiSaveState({ pendingVerify: false });
  uiRefreshStatus();
  log?.("Marcado como verificado. (Ya puedes vaciar cola si BD_REGISTROS está OK)");
}

async function uiRenderHistoryToday() {
  const list = document.getElementById("historyList");
  if (!list) return;

  const q = await safeGetQueue(80);
  if (!q.length) {
    list.innerHTML = `<div class="history-item"><div class="meta">No hay filas en cola.</div></div>`;
    return;
  }

  // Intento: mostrar lo más útil sin conocer tu estructura exacta
  // En tu cola suele haber { payload: {...} } o directamente el objeto.
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();

  const items = q
    .map(x => x.payload ? x.payload : x)
    .filter(p => {
      const t = p.createdAt || p.ts || p._ts || Date.parse(p.fecha_base || p.fecha_evento || "");
      if (!t || isNaN(t)) return true; // si no hay fecha, lo muestro igual
      const dd = new Date(t);
      return dd.getFullYear() === y && dd.getMonth() === m && dd.getDate() === d;
    })
    .slice(-20)
    .reverse();

  list.innerHTML = items.map(p => {
    const ev = p.evento || p.type || "—";
    const cat = p.categoria || "";
    const det = p.detalle || p.producto || "";
    const uni = (p.unidades ?? "");
    const kg = (p.kg_neto ?? p.kg_bruto ?? "");
    return `
      <div class="history-item">
        <div class="top">
          <span>${ev}</span>
          <span>${cat}</span>
        </div>
        <div class="meta">
          ${det ? `<div>${det}</div>` : ""}
          ${(uni !== "" && uni !== null) ? `<div>Unidades: ${uni}</div>` : ""}
          ${(kg !== "" && kg !== null) ? `<div>Kg: ${kg}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function wirePaquete2() {
  const btnClear = document.getElementById("btnClear");
  const btnVerified = document.getElementById("btnMarkVerified");
  const btnRefreshHistory = document.getElementById("btnRefreshHistory");

  btnVerified?.addEventListener("click", uiMarkVerified);

  btnRefreshHistory?.addEventListener("click", async () => {
    await uiRenderHistoryToday();
    await uiRefreshStatus();
  });

  // Vaciar cola seguro
  btnClear?.addEventListener(
  "click",
  withButtonFeedback(btnClear, async () => {
    const n = await safeQueueCount();
    const msg = (n === null)
      ? "¿Seguro que quieres vaciar la cola?"
      : `¿Seguro que quieres vaciar la cola?\nVas a borrar ${n} fila(s).`;

    if (!confirm(msg)) return;

    const ok = await safeClearQueue();
    if (!ok) {
      log("No pude vaciar la cola.");
      return;
    }
    uiSaveState({ pendingVerify: false });
    log("Cola vaciada.");
    flashSuccess(btnClear);
    await uiRefreshStatus();
    await uiRenderHistoryToday();
  })
);

  // Estado inicial + listeners red
  window.addEventListener("online", uiRefreshStatus);
  window.addEventListener("offline", uiRefreshStatus);

  uiRefreshStatus();
  uiRenderHistoryToday();
}

// Enganchar al load sin interferir con tu init actual
window.addEventListener("load", wirePaquete2);

function flashSuccess(btn, ms = 600) {
  if (!btn) return;
  btn.classList.add("btn-success");
  setTimeout(() => btn.classList.remove("btn-success"), ms);
}

function withButtonFeedback(btn, fn) {
  return async function (...args) {
    if (!btn) return;
    btn.classList.add("btn-working");
    try {
      await fn.apply(this, args);
    } finally {
      btn.classList.remove("btn-working");
    }
  };
}

// IMPORTANTE: cuando tu sync realmente "envíe", llama a uiMarkSent()
// Ejemplo: dentro de syncNow(), después de "sent=true", añade: uiMarkSent();
