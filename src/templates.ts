import * as SDK from "azure-devops-extension-sdk";
import { $, api, connect, loadTemplates, TEMPLATES, type Templates } from "./ado";
import { el, icon, list, resetList, type Item } from "./list";

interface Category { referenceName: string; workItemTypes: { name: string }[] }
interface WorkItemType { name: string; color?: string; icon?: { url: string } }

const plural = (type: string) => `${type}s`;
const same = (a: Templates, b: Templates) => JSON.stringify([a.types, a.off ?? []]) === JSON.stringify([b.types, b.off ?? []]);

async function main() {
  await SDK.init();
  const project = SDK.getWebContext().project;
  const [data, cats, wits] = await Promise.all([
    connect(),
    api<{ value: Category[] }>(`${project.id}/_apis/wit/workitemtypecategories?api-version=7.1`),
    api<{ value: WorkItemType[] }>(`${project.id}/_apis/wit/workitemtypes?api-version=7.1`),
  ]);
  let saved: Templates = await loadTemplates(data, project.id);
  let doc: Templates = structuredClone(saved);

  // Every visible type in the project's process, e.g. Epic, Feature, PBI, Bug, Task.
  const names = [...new Set(cats.value.filter((c) => c.referenceName !== "Microsoft.HiddenCategory").flatMap((c) => c.workItemTypes.map((t) => t.name)))];
  const meta = Object.fromEntries(wits.value.map((w) => [w.name, w]));
  let selected = names[0], filter = "", saving = false, justSaved = false;

  const typeIcon = (name: string) => {
    const img = el("img", { src: meta[name]?.icon?.url ?? "", alt: "" });
    img.onerror = () => img.remove();
    return img;
  };

  function render() {
    const dirty = !same(doc, saved);
    if (dirty) justSaved = false;
    $("unsaved").hidden = !dirty || saving;
    $("saved").hidden = !justSaved;
    $("saved").innerHTML = justSaved ? `${icon("check", 14)}Saved` : "";
    const save = $<HTMLButtonElement>("save");
    save.classList.toggle("busy", saving);
    save.innerHTML = saving ? '<span class="spinner" aria-hidden="true"></span>Saving…' : "Save";
    $<HTMLButtonElement>("discard").disabled = save.disabled = !dirty || saving;

    $("types").replaceChildren(...names.filter((n) => n.toLowerCase().includes(filter)).map((name) => {
      const n = doc.types[name]?.length ?? 0;
      const b = el("button", { type: "button", className: "type", onclick: () => { selected = name; resetList(); render(); } },
        typeIcon(name), el("span", { className: "name", textContent: name }),
        el("span", { className: "count" + (n ? "" : " none"), textContent: n ? `${n} item${n === 1 ? "" : "s"}` : "No template" }));
      if (name === selected) b.setAttribute("aria-current", "true");
      return b;
    }));

    const items: Item[] = (doc.types[selected] ?? []).map((text) => ({ text }));
    const on = !doc.off?.includes(selected);
    const color = `#${meta[selected]?.color ?? "605E5C"}`;

    const others = names.filter((n) => n !== selected && doc.types[n]?.length);
    const copy = el("label", { className: "copy", innerHTML: icon("copy", 14) }, "Copy from another type");
    const pick = el("select", {}, el("option", { value: "", textContent: "Copy from another type" }), ...others.map((n) => el("option", { value: n, textContent: `${n} (${doc.types[n].length})` })));
    pick.onchange = () => { doc.types[selected] = [...(doc.types[selected] ?? []), ...doc.types[pick.value]]; render(); };
    copy.append(pick);

    const toggle = el("button", { type: "button", className: "switch", onclick: () => {
      doc.off = on ? [...(doc.off ?? []), selected] : doc.off!.filter((n) => n !== selected);
      render();
    } });
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(on));
    toggle.setAttribute("aria-label", `Add to new ${plural(selected)} automatically`);

    const iconBox = el("span", { className: "type-icon" }, typeIcon(selected));
    iconBox.style.background = `${color}1A`;

    $("editor").replaceChildren(
      el("div", { className: "editor-header" }, el("h2", {}, iconBox, `${selected} checklist`), ...(others.length ? [copy] : [])),
      el("div", { className: "auto" }, toggle, el("div", {},
        el("strong", { textContent: `Add to new ${plural(selected)} automatically` }),
        el("span", { textContent: `Every new ${selected} starts with these items. People can still add, remove, or edit items on each work item.` }))),
      el("div", {},
        el("div", { className: "items-header" },
          el("h3", {}, "Items", ...(items.length ? [el("span", { className: "pill", textContent: String(items.length) })] : [])),
          ...(items.length > 1 ? [el("small", { textContent: "Drag to reorder" })] : [])),
        list({
          items,
          numbered: true,
          empty: el("div", { className: "empty", innerHTML: `<span class="empty-icon">${icon("listChecks", 20)}</span>` },
            el("strong", { textContent: `No template for ${plural(selected)} yet` }),
            el("span", { textContent: `New ${plural(selected)} start with an empty checklist. Add items here, or copy them from another type.` })),
          onChange: () => { doc.types[selected] = items.map((i) => i.text); render(); },
        })),
    );
  }

  $("search-icon").innerHTML = icon("search", 14);
  $<HTMLInputElement>("filter").oninput = (e) => { filter = (e.target as HTMLInputElement).value.trim().toLowerCase(); render(); };
  $("discard").onclick = () => { doc = structuredClone(saved); resetList(); $("msg").textContent = ""; render(); };
  $("save").onclick = async () => {
    saving = true;
    $("msg").textContent = "";
    render();
    try {
      doc.updatedBy = SDK.getUser().displayName;
      doc.updatedAt = new Date().toISOString();
      doc = doc.__etag ? await data.setDocument(TEMPLATES, doc) : await data.createDocument(TEMPLATES, doc);
      saved = structuredClone(doc);
      justSaved = true;
    } catch {
      $("msg").textContent = "Someone else saved in the meantime. Reload the page and try again.";
    }
    saving = false;
    render();
  };
  $("loading").hidden = true;
  $("actions").hidden = $("card").hidden = false;
  render();
}

main().catch((e) => { $("loading").hidden = true; $("msg").textContent = `Failed to load: ${e.message}`; });
