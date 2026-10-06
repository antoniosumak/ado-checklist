# Work Item Checklist

Azure DevOps extension: a checklist group on the work item form, with default items per work item type. See [overview.md](overview.md) for what it does.

## Build

```bash
npm install
npm run build     # typecheck + bundle src/ into static/
npm run package   # build + create the .vsix
```

Upload the `.vsix` at the [Marketplace publisher portal](https://marketplace.visualstudio.com/manage), then share or install it in your organization.

## Layout

- `src/checklist.ts`: the work item form group.
- `src/templates.ts`: the **Project settings → Checklist templates** hub.
- `src/list.ts`: the editable, draggable list both use.
- `src/ado.ts`: ADO services, REST calls, default templates.
- `promo/`: the scripts that rendered `promo/promo.mp4`.
