# Work Item Checklist

A checklist right on the work item form. Break work into steps, check them off, and start every Bug, Story or Task with the right items already in place.

## Features

- **Checklist group on the work item form.** Add, edit, reorder (drag) and check off items. Everyone on the team sees the same list.
- **Default items per work item type.** Set templates under **Project settings → Checklist templates**, e.g. "Repro steps filled" for Bugs or "Acceptance criteria written" for Stories. Copy a template from another type to get started.
- **Sync with template.** When a template changes, existing work items can pull in the new items. Your own items and progress stay as they are; checked items are never removed.
- **Hide completed** items to focus on what's left.
- **Progress on cards (optional).** Add a text field `Custom.Checklist` to your process and show it on board cards to see progress like `3/5`.

## Getting started

1. Install the extension in your organization.
2. Open **Project settings → Checklist templates** and add default items for each work item type.
3. Open any saved work item. The **Checklist** group appears on the form.

## Permissions

The extension needs **Work items (read & write)** to update the optional progress field. Checklists and templates are stored in the extension's own data storage in your organization.
