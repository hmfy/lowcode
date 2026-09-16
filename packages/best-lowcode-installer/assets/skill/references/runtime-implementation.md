# Runtime implementation rules

Use this reference after `workflow.md` whenever implementing or modifying BEST low-code UI.

## Runtime ownership

The visible page body and CRUD data flow must be owned by Runtime. A BEST CRUD page uses
`BestProvider` and `BestCrudPage`; `index.tsx` only wires provider, schema, adapter, and registry.
Do not hide `BestCrudPage`, render it off-screen, or maintain a second handwritten list/form state
beside it.

Use these file boundaries:

- `schema.ts`: page structure, fields, columns, actions, detail, search, table, and form schema.
- `adapter.ts`: request/response mapping, payload serialization, and field conversion.
- `registry.ts`: services, dictionaries, actions, slots, and access checks.
- `index.tsx`: Runtime assembly only.

## Capability order

Prefer capabilities in this order:

1. Native Runtime schema
2. Native Runtime UI primitive
3. Registry service/action/dictionary or adapter
4. Runtime slot
5. Runtime extension
6. Handwritten React/Ant Design

Only use handwritten React/Ant Design after the audit records `runtime-not-supported`, or after the
user explicitly accepts a one-off fallback for `extension-required`.

## Coverage statuses

Classify every atomic requirement as one of:

- `native-supported`: Runtime schema, Runtime UI, registry, or adapter fully covers the behavior.
- `slot-supported`: Runtime owns the surrounding page behavior and a local slot renders a complex
  subsection.
- `extension-required`: Runtime has a nearby abstraction, but the missing behavior belongs in a
  reusable Runtime extension.
- `runtime-not-supported`: Runtime has no suitable abstraction for the behavior.

Do not mark a requirement unsupported only because it needs custom layout, multiple field groups,
arrays, images, dynamic copy, or business API calls. First evaluate `detail.fields`,
`dataSource.detail`, search/form fields, registry services/actions/dictionaries, adapter mapping,
and slots.

## Required fallback record

For every non-native requirement, record:

- requirement
- attempted Runtime capability
- corresponding Schema/API
- limitation
- slot evaluation
- selected fallback

`runAction` must not be used merely as a bridge into handwritten UI when the behavior can be
represented by `openDetail`, `detail.fields`, `dataSource.detail`, `form`, `confirm`, or a slot.

## Common classifications

- List, search, pagination: `native-supported` with `BestCrudPage`, `BestSearch`, `BestTable`,
  `/dataSource/list`, `/search`, and `/table`.
- Basic detail fields: `native-supported` with `BestDetail`, `/detail/fields`, and
  `/dataSource/detail`.
- Complex detail groups, shareholder blocks, arrays, or image sections: `slot-supported` when
  Runtime owns detail opening and data loading.
- Static action confirmation: `native-supported` with action `confirm` and `runAction`.
- API parameter or response conversion: `native-supported` with registry services and adapter.
- KYC action forms with dynamic required reasons: `extension-required` unless Runtime provides an
  action-form abstraction.
- Confirmation dialogs that require text input: `runtime-not-supported` unless Runtime provides an
  input-capable confirm/action-form abstraction.

## Verification

Before reporting completion, run `best_verify`, every `AgentTask.verificationCommands` entry, and
the relevant project typecheck/test/build commands. If browser behavior was changed, verify it in a
real browser.
