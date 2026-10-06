import * as SDK from "azure-devops-extension-sdk";
import { $, api, connect, loadTemplates, type DataManager } from "./ado";
import { el, icon, iconButton, list, type Item } from "./list";

interface Doc { id: string; items: Item[]; __etag?: number }
interface FormService {
  getFieldValue(field: string): Promise<unknown>;
  setFieldValue(field: string, value: unknown): Promise<boolean>;
  isDirty(): Promise<boolean>;
  refresh(): Promise<void>;
}
interface FormArgs { id: number; isNew?: boolean; isReadOnly?: boolean }
interface Template { type: string; items: string[]; auto: boolean; updatedBy?: string; updatedAt?: string }

const COLLECTION = "checklists";
const HIDE_KEY = "checklist.hideDone";
// Text field an admin adds to the process; boards show it once enabled in card settings.
const COUNT_FIELD = "Custom.Checklist";

let form: FormService, data: DataManager, doc: Doc | null = null, readOnly = false, current = 0, note = "";
let tpl: Template | null = null, reviewing = false, removeExtra = false;
// After a sync: what to undo, and which items to tag NEW (by text; saves replace the item objects).
let synced: { added: number; removed: number; before: Item[] } | null = null, fresh = new Set<string>();
const written = new Map<string, string>(); // last count written per work item, to skip no-op PATCHes

// Per-viewer storage; can be blocked inside the iframe.
const stored = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* per-session only */ } };
let hideDone = stored(HIDE_KEY) === "1";

const norm = (s: string) => s.trim().toLowerCase();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Template items missing from the checklist, and checklist items not in the template.
function diff() {
  const have = new Set(doc!.items.map((i) => norm(i.text)));
  const want = new Set(tpl!.items.map(norm));
  const add = [...new Map(tpl!.items.filter((t) => !have.has(norm(t))).map((t) => [norm(t), t])).values()];
  const extra = doc!.items.filter((i) => !want.has(norm(i.text)));
  return { add, extra, same: doc!.items.filter((i) => want.has(norm(i.text))), removable: extra.filter((i) => !i.done) };
}

function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, n] of [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]] as const)
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "just now";
}

// Type of another work item (the parent); the form only exposes its own fields.
async function typeOf(id: number) {
  const wi = await api<{ fields: Record<string, string> }>(`_apis/wit/workitems/${id}?fields=System.WorkItemType&api-version=7.1`);
  return wi.fields["System.WorkItemType"];
}

async function load(id: number, isNew?: boolean, isReadOnly = readOnly) {
  await ready;
  readOnly = isReadOnly;
  if (id !== current) { synced = null; fresh = new Set(); }
  current = id;
  reviewing = false;
  if (isNew) { doc = null; tpl = null; return render("Save the work item to use the checklist."); }
  // Tasks share their parent's checklist (PBIs under a Feature keep their own).
  const ownType = String(await form.getFieldValue("System.WorkItemType"));
  const parent = ownType === "Task" ? Number(await form.getFieldValue("System.Parent")) || 0 : 0;
  const key = parent || id;
  const [type, templates] = await Promise.all([
    parent ? typeOf(parent).catch(() => "") : ownType,
    loadTemplates(data, SDK.getWebContext().project.id),
  ]);
  tpl = { type, items: templates.types[type] || [], auto: !templates.off?.includes(type), updatedBy: templates.updatedBy, updatedAt: templates.updatedAt };
  try {
    doc = await data.getDocument<Doc>(COLLECTION, String(key));
  } catch {
    // No doc yet (or read failed). First save uses createDocument, which never overwrites.
    doc = { id: String(key), items: (tpl.auto ? tpl.items : []).map((text) => ({ text, done: false })) };
  }
  note = parent ? `Shared with parent #${parent}.` : "";
  render(note);
}

async function save() {
  try {
    doc = doc!.__etag ? await data.setDocument(COLLECTION, doc) : await data.createDocument(COLLECTION, doc);
    render(note);
    writeCount().catch((e) => console.warn(`Checklist count not written to ${COUNT_FIELD}:`, e));
  } catch {
    // Etag conflict: someone else edited. Reload their version.
    synced = null;
    await load(current, false);
    $("msg").textContent = "Checklist changed elsewhere. Reloaded.";
  }
}

// Mirror "done/total" into COUNT_FIELD on the checklist's owner (the parent for shared Task checklists).
async function writeCount() {
  const items = doc!.items, id = doc!.id;
  const value = items.length ? `${items.filter((i) => i.done).length}/${items.length}` : "";
  if (written.get(id) === value) return;
  written.set(id, value);
  const own = id === String(current);
  // Unsaved edits on this form: let the user's save carry the value, a REST write would make that save conflict.
  if (own && await form.isDirty()) return void form.setFieldValue(COUNT_FIELD, value);
  await api(`_apis/wit/workitems/${id}?api-version=7.1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify([{ op: "add", path: `/fields/${COUNT_FIELD}`, value }]),
  }).catch((e) => { written.delete(id); throw e; });
  // Pull the new revision so the form's next save doesn't conflict.
  if (own) await form.refresh();
}

function setHideDone(v: boolean) {
  hideDone = v;
  store(HIDE_KEY, v ? "1" : "0");
  render(note);
}

// Adds missing template items at the end; never touches existing ones unless removeExtra (unchecked only).
function sync() {
  const { add, removable } = diff();
  const drop = new Set(removeExtra ? removable : []);
  synced = { added: add.length, removed: drop.size, before: structuredClone(doc!.items) };
  fresh = new Set(add.map(norm));
  doc!.items = [...doc!.items.filter((i) => !drop.has(i)), ...add.map((text) => ({ text, done: false }))];
  reviewing = removeExtra = false;
  render(note);
  save();
}

function undo() {
  doc!.items = synced!.before;
  synced = null;
  fresh = new Set();
  render(note);
  save();
}

const banner = (kind: "info" | "success", iconName: "info" | "circleCheck", ...kids: (Node | string)[]) =>
  el("div", { className: `banner ${kind}`, innerHTML: icon(iconName) }, ...kids);
const link = (text: string, onclick: () => void) => el("button", { type: "button", className: "link", textContent: text, onclick });

function dialog() {
  const { add, extra, same, removable } = diff();
  const removing = removeExtra ? removable.length : 0;
  const close = () => { reviewing = removeExtra = false; render(note); };
  const section = (title: string, rows: Node[]) => rows.length ? [el("div", { className: "section" }, el("h4", { textContent: `${title} · ${rows.length}` }), ...rows)] : [];
  const change = (kind: string, iconName: "plus" | "minus" | "check", text: string, tag = "") =>
    el("div", { className: `change ${kind}`, innerHTML: icon(iconName, 14) }, el("span", { textContent: text }), ...(tag ? [el("small", { textContent: tag })] : []));

  const box = el("input", { type: "checkbox", className: "box", id: "remove-extra", checked: removeExtra });
  box.onchange = () => { removeExtra = box.checked; render(note); };
  const confirm = el("button", { type: "button", className: "btn primary", disabled: !add.length && !removing, onclick: sync,
    textContent: removing ? `Add ${add.length}, remove ${removing}` : add.length ? `Add ${plural(add.length, "item")}` : "Up to date" });
  const d = el("div", { className: "dialog" },
    el("div", { className: "dialog-header" },
      el("div", {}, el("h3", { textContent: `Sync with ${tpl!.type} template` }),
        ...(tpl!.updatedAt ? [el("p", { textContent: `Template updated ${tpl!.updatedBy ? `by ${tpl!.updatedBy}, ` : ""}${ago(tpl!.updatedAt)}` })] : [])),
      iconButton("x", "Close", close)),
    el("div", { className: "dialog-body" },
      ...section("WILL BE ADDED", add.map((t) => change("add", "plus", t))),
      ...section("NOT IN TEMPLATE", extra.map((i) => change("extra", "minus", i.text, removeExtra && !i.done ? "Removed" : "Kept"))),
      ...section("UNCHANGED", same.map((i) => change("same", "check", i.text))),
      ...(extra.length ? [el("label", { className: "remove-option", htmlFor: "remove-extra" }, box,
        el("span", {}, el("span", { textContent: "Also remove items that are not in the template" }), el("small", { textContent: "Checked items are never removed." })))] : [])),
    el("div", { className: "dialog-footer" }, el("button", { type: "button", className: "btn", textContent: "Cancel", onclick: close }), confirm));
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-label", `Sync with ${tpl!.type} template`);
  d.onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  queueMicrotask(() => (confirm.disabled ? d.querySelector<HTMLElement>(".icon-btn") : confirm)?.focus());
  return d;
}

function render(message = "") {
  $("msg").textContent = message;
  const items = doc?.items ?? [];
  const done = items.filter((i) => i.done).length;
  const complete = items.length > 0 && done === items.length;
  const canSync = !!doc && !!tpl?.items.length && !readOnly;
  const missing = canSync ? diff().add : [];
  const dismissKey = `checklist.dismissed.${doc?.id}`;
  // Nudge only for types that auto-apply; dismissing hides it until the template changes again.
  const showUpdate = missing.length > 0 && tpl!.auto && !synced && stored(dismissKey) !== JSON.stringify(missing);
  const review = () => { reviewing = true; render(note); };

  const title = $("title");
  title.replaceChildren("Checklist");
  if (items.length) title.append(el("span", { className: "pill" + (complete ? " success" : ""), innerHTML: complete ? icon("check", 12) : "" }, `${done}/${items.length}`));
  const actions: Node[] = [];
  if (canSync) {
    const b = el("button", { type: "button", className: "sync", innerHTML: icon("refresh", 14), title: "Sync with template", onclick: review }, "Sync");
    if (missing.length) b.append(el("span", { className: "dot", title: plural(missing.length, "new template item") }));
    actions.push(b);
  }
  if (items.length) actions.push(hideDone
    ? iconButton("eye", "Show completed", () => setHideDone(false))
    : iconButton("eyeOff", "Hide completed", () => setHideDone(true)));
  $("actions").replaceChildren(...actions);

  const body = $("body");
  body.replaceChildren();
  if (doc && reviewing) body.append(dialog());
  else if (doc) {
    if (showUpdate) body.append(banner("info", "info",
      el("div", { className: "copy" },
        el("strong", { textContent: `The ${tpl!.type} template has ${missing.length === 1 ? "a new item" : `${missing.length} new items`}` }),
        el("span", { textContent: "Sync to add them. Your items and progress stay as they are." })),
      link("Review", review),
      iconButton("x", "Dismiss", () => { store(dismissKey, JSON.stringify(missing)); render(note); }, 14)));
    if (synced) body.append(banner("success", "circleCheck",
      el("span", { className: "copy", textContent: `Synced with the ${tpl!.type} template. ${synced.added ? `${plural(synced.added, "item")} added` : "Nothing added"}${synced.removed ? `, ${synced.removed} removed` : ""}.` }),
      link("Undo", undo)));
    if (items.length) {
      const pct = Math.round((done / items.length) * 100);
      body.append(el("div", { className: "progress" + (complete ? " complete" : ""), innerHTML:
        `<div>${complete ? "<strong>All items done</strong>" : `<span>${done} of ${items.length} done</span>`}<span>${pct}%</span></div>` +
        `<div class="track" role="progressbar" aria-label="Checklist progress" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` }));
    }
    body.append(list({
      items,
      readOnly,
      checkable: true,
      hideDone,
      isNew: (i) => fresh.has(norm(i.text)),
      empty: el("div", { className: "empty", textContent: "No items yet. Break the work into steps you can check off." }),
      onShowDone: () => setHideDone(false),
      // Any edit after a sync makes Undo unsafe, so drop it.
      onChange: (persist) => { if (persist) synced = null; render(note); if (persist) save(); },
    }));
  }
  SDK.resize(undefined, document.body.scrollHeight);
}

// onLoaded can fire before services resolve, so load() awaits this.
const ready = SDK.init().then(async () => {
  // getContributionId() throws before init completes, so register here.
  SDK.register(SDK.getContributionId(), {
    onLoaded: (a: FormArgs) => load(a.id, a.isNew, a.isReadOnly),
    onSaved: (a: FormArgs) => load(a.id, false),
    onRefreshed: (a: FormArgs) => load(a.id, false),
  });
  form = await SDK.getService<FormService>("ms.vss-work-web.work-item-form");
  data = await connect();
});
