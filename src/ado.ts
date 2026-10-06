import * as SDK from "azure-devops-extension-sdk";

// ponytail: minimal shapes of the ADO services used; swap for azure-devops-extension-api if more are needed
export interface DataManager {
  getDocument<T>(collection: string, id: string): Promise<T>;
  setDocument<T>(collection: string, doc: T): Promise<T>;
  createDocument<T>(collection: string, doc: T): Promise<T>;
}
interface ExtensionDataService { getExtensionDataManager(extensionId: string, token: string): Promise<DataManager> }

// One doc per project in this collection; once saved it replaces DEFAULTS entirely.
// `off` lists types whose items are kept but not added to new checklists.
export interface Templates { id: string; types: Record<string, string[]>; off?: string[]; updatedBy?: string; updatedAt?: string; __etag?: number }
export const TEMPLATES = "templates";

// Fallback until someone saves templates in Project Settings.
export const DEFAULTS: Record<string, string[]> = {
  "Product Backlog Item": ["Design link added", "Acceptance criteria written", "Test Cases linked", "Screenshots attached"],
  Bug: ["Repro steps filled", "Screenshots / recording attached", "Environment noted", "Test Case linked"],
  Task: ["Definition of done clear"],
};

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function connect() {
  const eds = await SDK.getService<ExtensionDataService>("ms.vss-features.extension-data-service");
  return eds.getExtensionDataManager(SDK.getExtensionContext().id, await SDK.getAccessToken());
}

// Call the org's REST API (GET unless init says otherwise). ponytail: dev.azure.com only, not on-prem Server.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://dev.azure.com/${SDK.getHost().name}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await SDK.getAccessToken()}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export async function loadTemplates(data: DataManager, projectId: string): Promise<Templates> {
  try {
    return await data.getDocument<Templates>(TEMPLATES, projectId);
  } catch {
    return { id: projectId, types: structuredClone(DEFAULTS) };
  }
}
