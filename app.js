"use strict";

/* ---------- Configuration ---------- */
const BUSINESS = {
  name: "Matola Digital Solutions",
  tagline: "Innovating Businesses Through Technology",
  phone: "+971 54 550 4996",
  email: "matola.ai.solutions@gmail.com"
};
const CURRENCY = "AED";
const DOCS_KEY = "matola_docs_v1";
const COUNTERS_KEY = "matola_counters_v1";
const PREFIX = { quotation: "QUO", invoice: "INV" };
const LABEL = { quotation: "Quotation", invoice: "Invoice" };
const DUE_DAYS = { quotation: 30, invoice: 14 };

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return CURRENCY + " " + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function newId() {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Calculations (done in whole cents to avoid rounding drift) ---------- */
function calculate(items, discountPct) {
  const lines = items.map((it) => Math.round((Number(it.qty) || 0) * (Number(it.price) || 0) * 100));
  const subtotal = lines.reduce((a, b) => a + b, 0);
  const pct = Math.min(Math.max(Number(discountPct) || 0, 0), 100);
  const discount = Math.round(subtotal * pct / 100);
  return {
    lines: lines.map((c) => c / 100),
    subtotal: subtotal / 100,
    discount: discount / 100,
    total: (subtotal - discount) / 100,
    pct
  };
}

/* ---------- Storage ---------- */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    showErrors(["Could not save to this browser. Storage may be full or disabled (private mode)."]);
    return false;
  }
}

const getDocs = () => readJSON(DOCS_KEY, []);
const saveDocs = (docs) => writeJSON(DOCS_KEY, docs);

function counterKey(type) {
  return type + "-" + new Date().getFullYear();
}

function formatNumber(type, seq) {
  return PREFIX[type] + "-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
}

function peekNumber(type) {
  const c = readJSON(COUNTERS_KEY, {});
  return formatNumber(type, (c[counterKey(type)] || 0) + 1);
}

function takeNumber(type) {
  const c = readJSON(COUNTERS_KEY, {});
  const seq = (c[counterKey(type)] || 0) + 1;
  c[counterKey(type)] = seq;
  writeJSON(COUNTERS_KEY, c);
  return formatNumber(type, seq);
}

/* ---------- State and navigation ---------- */
let editingId = null;
let previousView = "create";

function showView(name) {
  ["create", "saved", "preview"].forEach((v) => { $("view-" + v).hidden = v !== name; });
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === name));
  if (name !== "preview") previousView = name;
  if (name === "saved") renderSaved();
  window.scrollTo(0, 0);
}

/* ---------- Form: service rows ---------- */
function addItemRow(item) {
  const row = document.createElement("div");
  row.className = "item";
  row.innerHTML =
    '<label class="desc">Description<input type="text" class="i-desc" placeholder="e.g. Website design"></label>' +
    '<label>Qty<input type="number" class="i-qty" min="0" step="any" inputmode="decimal"></label>' +
    '<label>Unit price (' + CURRENCY + ')<input type="number" class="i-price" min="0" step="0.01" inputmode="decimal"></label>' +
    '<div class="line-total"><span class="i-total">' + money(0) + '</span>' +
    '<button type="button" class="remove">Remove</button></div>';
  row.querySelector(".i-desc").value = item ? item.desc : "";
  row.querySelector(".i-qty").value = item ? item.qty : 1;
  row.querySelector(".i-price").value = item ? item.price : "";
  $("items").appendChild(row);
  updateTotals();
}

function readItems() {
  return Array.from(document.querySelectorAll("#items .item")).map((row) => ({
    desc: row.querySelector(".i-desc").value.trim(),
    qty: row.querySelector(".i-qty").value,
    price: row.querySelector(".i-price").value
  }));
}

function updateTotals() {
  const items = readItems();
  const r = calculate(items, $("discount").value);
  document.querySelectorAll("#items .item .i-total").forEach((el, i) => {
    el.textContent = money(r.lines[i]);
  });
  $("liveTotals").innerHTML =
    "<div><dt>Subtotal</dt><dd>" + money(r.subtotal) + "</dd></div>" +
    "<div><dt>Discount (" + r.pct + "%)</dt><dd>- " + money(r.discount) + "</dd></div>" +
    '<div class="final"><dt>Amount payable</dt><dd>' + money(r.total) + "</dd></div>";
}

/* ---------- Form: reset, load, validate, save ---------- */
function resetForm(type) {
  editingId = null;
  const t = type || "quotation";
  const today = toISO(new Date());
  $("formTitle").textContent = "New document";
  $("docType").value = t;
  $("docType").disabled = false;
  $("docDate").value = today;
  $("dueDate").value = addDays(today, DUE_DAYS[t]);
  ["custName", "custPhone", "custEmail", "custAddress", "notes"].forEach((id) => { $(id).value = ""; });
  $("discount").value = 0;
  $("items").innerHTML = "";
  addItemRow();
  clearErrors();
  syncTypeUI();
}

function syncTypeUI() {
  const t = $("docType").value;
  $("dueLabel").textContent = t === "invoice" ? "Payment due date" : "Valid until";
  $("docNumber").value = editingId
    ? ($("docNumber").value)
    : peekNumber(t);
}

function loadDoc(doc) {
  editingId = doc.id;
  $("formTitle").textContent = "Edit " + LABEL[doc.type].toLowerCase();
  $("docType").value = doc.type;
  $("docType").disabled = true;
  $("docNumber").value = doc.number;
  $("docDate").value = doc.date;
  $("dueDate").value = doc.dueDate;
  $("custName").value = doc.customer.name;
  $("custPhone").value = doc.customer.phone;
  $("custEmail").value = doc.customer.email;
  $("custAddress").value = doc.customer.address;
  $("notes").value = doc.notes || "";
  $("discount").value = doc.discountPct;
  $("items").innerHTML = "";
  doc.items.forEach(addItemRow);
  $("dueLabel").textContent = doc.type === "invoice" ? "Payment due date" : "Valid until";
  clearErrors();
  updateTotals();
  showView("create");
}

function clearErrors() {
  $("formError").hidden = true;
  $("formError").innerHTML = "";
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
}

function showErrors(list) {
  const box = $("formError");
  box.innerHTML = "<strong>Please fix the following:</strong><ul>" +
    list.map((m) => "<li>" + esc(m) + "</li>").join("") + "</ul>";
  box.hidden = false;
  if (!$("view-create").hidden || $("view-saved").hidden === false) window.scrollTo(0, 0);
}

function validate() {
  clearErrors();
  const errors = [];
  const flag = (el) => el && el.classList.add("invalid");

  if (!$("custName").value.trim()) { errors.push("Customer name is required."); flag($("custName")); }

  const email = $("custEmail").value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Enter a valid email address."); flag($("custEmail"));
  }
  const phone = $("custPhone").value.trim();
  if (phone && !/^[+()\d\s-]{6,20}$/.test(phone)) {
    errors.push("Phone number may only contain digits, spaces, +, - and brackets."); flag($("custPhone"));
  }

  if (!$("docDate").value) { errors.push("Document date is required."); flag($("docDate")); }
  if (!$("dueDate").value) { errors.push("Due date is required."); flag($("dueDate")); }
  else if ($("docDate").value && $("dueDate").value < $("docDate").value) {
    errors.push("Due date cannot be before the document date."); flag($("dueDate"));
  }

  const disc = $("discount").value;
  const d = Number(disc);
  if (disc === "" || isNaN(d) || d < 0 || d > 100) {
    errors.push("Discount must be between 0 and 100%."); flag($("discount"));
  }

  const rows = document.querySelectorAll("#items .item");
  if (!rows.length) errors.push("Add at least one service.");
  rows.forEach((row, i) => {
    const n = i + 1;
    const desc = row.querySelector(".i-desc");
    const qty = row.querySelector(".i-qty");
    const price = row.querySelector(".i-price");
    if (!desc.value.trim()) { errors.push("Service " + n + ": description is required."); flag(desc); }
    if (qty.value === "" || isNaN(Number(qty.value)) || Number(qty.value) <= 0) {
      errors.push("Service " + n + ": quantity must be greater than 0."); flag(qty);
    }
    if (price.value === "" || isNaN(Number(price.value)) || Number(price.value) < 0) {
      errors.push("Service " + n + ": unit price must be 0 or more."); flag(price);
    }
  });

  if (errors.length) showErrors(errors);
  return errors.length === 0;
}

function saveDocument() {
  if (!validate()) return;
  const type = $("docType").value;
  const docs = getDocs();
  const data = {
    type,
    date: $("docDate").value,
    dueDate: $("dueDate").value,
    customer: {
      name: $("custName").value.trim(),
      phone: $("custPhone").value.trim(),
      email: $("custEmail").value.trim(),
      address: $("custAddress").value.trim()
    },
    items: readItems().map((i) => ({ desc: i.desc, qty: Number(i.qty), price: Number(i.price) })),
    discountPct: Number($("discount").value),
    notes: $("notes").value.trim()
  };

  let doc;
  if (editingId) {
    const idx = docs.findIndex((x) => x.id === editingId);
    if (idx === -1) { showErrors(["This document no longer exists."]); return; }
    doc = Object.assign({}, docs[idx], data, { updatedAt: Date.now() });
    docs[idx] = doc;
  } else {
    doc = Object.assign({ id: newId(), number: takeNumber(type), createdAt: Date.now() }, data);
    docs.unshift(doc);
  }
  if (!saveDocs(docs)) return;
  editingId = doc.id;
  openPreview(doc);
}

/* ---------- Saved documents ---------- */
function renderSaved() {
  const docs = getDocs();
  $("savedCount").textContent = docs.length;
  if (!docs.length) {
    $("savedList").innerHTML = '<p class="empty">No saved documents yet. Create your first quotation or invoice.</p>';
    return;
  }
  $("savedList").innerHTML = docs.map((d) => {
    const total = calculate(d.items, d.discountPct).total;
    return '<div class="doc-row">' +
      '<div><strong>' + esc(d.number) + '</strong> &middot; ' + esc(LABEL[d.type]) +
      '<div>' + esc(d.customer.name) + '</div>' +
      '<div class="meta">' + fmtDate(d.date) + ' &middot; ' + money(total) + '</div></div>' +
      '<div class="row-actions" data-id="' + esc(d.id) + '">' +
      '<button class="btn small secondary" data-act="view">View</button>' +
      '<button class="btn small secondary" data-act="edit">Edit</button>' +
      (d.type === "quotation" ? '<button class="btn small secondary" data-act="convert">Make invoice</button>' : "") +
      '<button class="btn small danger" data-act="delete">Delete</button></div></div>';
  }).join("");
}

function convertToInvoice(doc) {
  const today = toISO(new Date());
  const inv = {
    id: newId(),
    type: "invoice",
    number: takeNumber("invoice"),
    createdAt: Date.now(),
    date: today,
    dueDate: addDays(today, DUE_DAYS.invoice),
    customer: Object.assign({}, doc.customer),
    items: doc.items.map((i) => Object.assign({}, i)),
    discountPct: doc.discountPct,
    notes: doc.notes,
    fromQuotation: doc.number
  };
  const docs = getDocs();
  docs.unshift(inv);
  if (saveDocs(docs)) openPreview(inv);
}

/* ---------- Preview ---------- */
function openPreview(doc) {
  const r = calculate(doc.items, doc.discountPct);
  const c = doc.customer;
  const rows = doc.items.map((it, i) =>
    "<tr><td>" + (i + 1) + "</td><td>" + esc(it.desc) + '</td><td class="num">' + esc(it.qty) +
    '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(r.lines[i]) + "</td></tr>"
  ).join("");

  $("previewDoc").innerHTML =
    '<div class="doc-head">' +
      "<div><h2>" + esc(BUSINESS.name) + "</h2><p>" + esc(BUSINESS.tagline) + "</p>" +
      "<p>" + esc(BUSINESS.phone) + "</p><p>" + esc(BUSINESS.email) + "</p></div>" +
      '<div class="doc-meta"><div class="doc-title">' + esc(LABEL[doc.type].toUpperCase()) + "</div>" +
      "<p>No: " + esc(doc.number) + "</p><p>Date: " + fmtDate(doc.date) + "</p>" +
      "<p>" + (doc.type === "invoice" ? "Payment due: " : "Valid until: ") + fmtDate(doc.dueDate) + "</p>" +
      (doc.fromQuotation ? "<p>Ref: " + esc(doc.fromQuotation) + "</p>" : "") + "</div>" +
    "</div>" +
    '<div class="doc-parties"><div><h3>Prepared for</h3><p><strong>' + esc(c.name) + "</strong></p>" +
      (c.phone ? "<p>" + esc(c.phone) + "</p>" : "") +
      (c.email ? "<p>" + esc(c.email) + "</p>" : "") +
      (c.address ? "<p>" + esc(c.address) + "</p>" : "") + "</div>" +
      "<div><h3>From</h3><p><strong>" + esc(BUSINESS.name) + "</strong></p><p>" +
      esc(BUSINESS.phone) + "</p><p>" + esc(BUSINESS.email) + "</p></div></div>" +
    '<div class="table-wrap"><table><thead><tr><th>#</th><th>Description</th>' +
      '<th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>" +
    '<dl class="totals doc-totals">' +
      "<div><dt>Subtotal</dt><dd>" + money(r.subtotal) + "</dd></div>" +
      "<div><dt>Discount (" + r.pct + "%)</dt><dd>- " + money(r.discount) + "</dd></div>" +
      '<div class="final"><dt>Amount payable</dt><dd>' + money(r.total) + "</dd></div></dl>" +
    (doc.notes ? '<div class="doc-notes"><strong>Notes</strong><br>' + esc(doc.notes) + "</div>" : "") +
    '<p class="doc-foot">Thank you for your business.</p>';

  $("printBtn").dataset.title = doc.number + " - " + c.name;
  showView("preview");
}

function printDocument() {
  const original = document.title;
  document.title = $("printBtn").dataset.title || original;
  window.addEventListener("afterprint", () => { document.title = original; }, { once: true });
  window.print();
}

/* ---------- Event wiring ---------- */
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    if (tab.dataset.view === "create" && $("view-create").hidden) resetForm("quotation");
    showView(tab.dataset.view);
  }));

$("addItem").addEventListener("click", () => addItemRow());

$("items").addEventListener("input", updateTotals);
$("items").addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove")) return;
  const rows = document.querySelectorAll("#items .item");
  if (rows.length === 1) { showErrors(["A document needs at least one service."]); return; }
  e.target.closest(".item").remove();
  updateTotals();
});

$("discount").addEventListener("input", updateTotals);

$("docType").addEventListener("change", () => {
  syncTypeUI();
  $("dueDate").value = addDays($("docDate").value || toISO(new Date()), DUE_DAYS[$("docType").value]);
});

$("docDate").addEventListener("change", () => {
  if ($("docDate").value) {
    $("dueDate").value = addDays($("docDate").value, DUE_DAYS[$("docType").value]);
  }
});

$("saveBtn").addEventListener("click", saveDocument);
$("resetBtn").addEventListener("click", () => resetForm($("docType").value));
$("printBtn").addEventListener("click", printDocument);
$("backBtn").addEventListener("click", () => showView(previousView));

$("savedList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.parentElement.dataset.id;
  const docs = getDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  const act = btn.dataset.act;
  if (act === "view") openPreview(doc);
  else if (act === "edit") loadDoc(doc);
  else if (act === "convert") convertToInvoice(doc);
  else if (act === "delete") {
    if (confirm("Delete " + doc.number + "? This cannot be undone.")) {
      saveDocs(docs.filter((d) => d.id !== id));
      if (editingId === id) editingId = null;
      renderSaved();
    }
  }
});

/* ---------- Start ---------- */
resetForm("quotation");
$("savedCount").textContent = getDocs().length;
