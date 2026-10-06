// Editable item list shared by the checklist and the templates editor:
// drag to reorder, inline edit, delete, and an "Add item" row (Enter adds, Esc cancels).

const PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  minus: '<path d="M5 12h14"/>',
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
};

export const icon = (name: keyof typeof PATHS, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

export const iconButton = (name: keyof typeof PATHS, label: string, onclick: () => void, size = 16) => {
  const b = el("button", { type: "button", className: "icon-btn", innerHTML: icon(name, size), title: label, onclick });
  b.setAttribute("aria-label", label);
  return b;
};

export interface Item { text: string; done?: boolean }
export interface ListOpts {
  items: Item[];
  readOnly?: boolean;
  checkable?: boolean; // real checkbox that toggles done; otherwise a decorative box
  numbered?: boolean;
  hideDone?: boolean;
  isNew?(item: Item): boolean; // highlighted with a NEW tag
  empty?: Node; // shown instead of the list when there are no items
  onShowDone?(): void;
  onChange(save: boolean): void; // caller re-renders, and persists when save is true
}

// UI state that has to survive re-renders.
let adding = false, draft = "", editing = -1, dragFrom = -1;
export const resetList = () => { adding = false; draft = ""; editing = -1; };

export function list(o: ListOpts) {
  const wrap = el("div", { className: "list" + (o.numbered ? " numbered" : "") });
  if (!o.items.length && !adding && o.empty) wrap.append(o.empty);
  const ul = el("ul", { className: "items" });
  let hidden = 0;
  o.items.forEach((item, i) => (o.hideDone && item.done ? hidden++ : ul.append(row(o, item, i))));
  if (hidden) {
    const toggle = el("button", { type: "button", className: "row completed", innerHTML: `<span class="grip"></span>${icon("chevron")}` }, `${hidden} completed`);
    toggle.onclick = () => o.onShowDone?.();
    ul.append(el("li", {}, toggle));
  }
  if (!o.readOnly && adding) ul.append(addRow(o));
  if (ul.childElementCount) wrap.append(ul);
  if (!o.readOnly && !adding) {
    const add = el("button", { type: "button", className: "row add", innerHTML: `${o.numbered ? "" : '<span class="grip"></span>'}${icon("plus")}` }, "Add item");
    add.onclick = () => { adding = true; o.onChange(false); };
    wrap.append(add);
  }
  return wrap;
}

function row(o: ListOpts, item: Item, i: number) {
  const li = el("li", { className: "row" + (item.done ? " done" : "") + (o.isNew?.(item) ? " fresh" : "") });
  if (!o.readOnly) {
    li.append(el("span", { className: "grip", innerHTML: icon("grip", 14) }));
    li.draggable = editing !== i;
    li.ondragstart = (e) => { dragFrom = i; e.dataTransfer!.effectAllowed = "move"; li.classList.add("dragging"); };
    li.ondragend = () => { dragFrom = -1; li.classList.remove("dragging"); };
    li.ondragover = (e) => { if (dragFrom >= 0) e.preventDefault(); };
    li.ondrop = (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === i) return;
      o.items.splice(i, 0, ...o.items.splice(dragFrom, 1));
      dragFrom = -1;
      o.onChange(true);
    };
  }
  if (o.numbered) li.append(el("span", { className: "num", textContent: String(i + 1) }));
  if (o.checkable) {
    const box = el("input", { type: "checkbox", className: "box", checked: !!item.done, disabled: o.readOnly, id: `i${i}` });
    box.onchange = () => { item.done = box.checked; o.onChange(true); };
    li.append(box);
  } else li.append(el("span", { className: "box" }));

  if (editing === i) {
    const input = field(item.text, "Edit item");
    let finished = false;
    const finish = (keep: boolean) => {
      if (finished) return;
      finished = true;
      editing = -1;
      const text = input.value.trim();
      const changed = keep && !!text && text !== item.text;
      if (changed) item.text = text;
      o.onChange(changed);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.stopPropagation(); finish(false); }
    };
    input.onblur = () => finish(true);
    li.append(input);
    return li;
  }

  li.append(o.checkable ? el("label", { htmlFor: `i${i}`, className: "text", textContent: item.text }) : el("span", { className: "text", textContent: item.text }));
  if (o.isNew?.(item)) li.append(el("span", { className: "new-tag", textContent: "NEW" }));
  if (!o.readOnly) {
    const edit = () => { adding = false; editing = i; o.onChange(false); };
    li.querySelector(".text")!.addEventListener("dblclick", edit);
    const del = iconButton("trash", `Remove "${item.text}"`, () => { o.items.splice(i, 1); o.onChange(true); }, 14);
    li.append(el("span", { className: "row-actions" }, iconButton("pencil", `Edit "${item.text}"`, edit, 14), del));
  }
  return li;
}

function addRow(o: ListOpts) {
  const input = field(draft, "New item");
  input.placeholder = "Add an item";
  input.oninput = () => (draft = input.value);
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      o.items.push(o.checkable ? { text, done: false } : { text });
      draft = "";
      o.onChange(true);
    }
    if (e.key === "Escape") { e.stopPropagation(); resetList(); o.onChange(false); }
  };
  // Close when focus leaves an empty add row (re-renders move focus to the new input, so check after).
  input.onblur = () => setTimeout(() => {
    if (adding && !draft.trim() && !document.activeElement?.closest(".new")) { adding = false; o.onChange(false); }
  });
  const li = el("li", { className: "new" });
  li.append(el("div", { className: "row" }, el("span", { className: "grip" }), ...(o.numbered ? [el("span", { className: "num" })] : []), el("span", { className: "box" }), input));
  li.append(el("div", { className: "hint", textContent: "Enter to add, Esc to cancel" }));
  return li;
}

function field(value: string, label: string) {
  const input = el("input", { type: "text", className: "field", value, maxLength: 200 });
  input.setAttribute("aria-label", label);
  queueMicrotask(() => { input.focus(); input.setSelectionRange(value.length, value.length); });
  return input;
}
