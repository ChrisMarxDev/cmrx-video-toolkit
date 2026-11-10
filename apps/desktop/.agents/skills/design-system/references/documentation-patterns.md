# Documentation patterns

Use these as record shapes, not a requirement to generate every file. Keep records
next to the system's existing documentation and link to canonical source instead
of copying implementation into a second source of truth.

## System inventory

| Layer | Canonical source | Consumers | Evidence/status | Gaps |
|---|---|---|---|---|

Use explicit statuses such as implemented, approved intent, proposed, or unresolved.
For each gap, record the question and the affected work. Do not promote a proposal
to implemented merely because its documentation is complete.

## Semantic token record

- Name and purpose.
- Primitive or existing token reference; theme/state mappings where supported.
- Approved uses and combinations to avoid.
- Source definition and representative consumer.
- Verification of actual foreground/background or focus combinations when relevant.

Illustrative relationship, not a prescribed palette or naming scheme:

```text
primitive color → semantic text-muted → component secondary label
primitive spacing → semantic card-padding → reusable card block
```

A new numeric value belongs in the canonical token source when it is a reusable
design decision. A one-off exception needs a reason and scope; it should not
silently redefine the global scale.

## Component record

- Name, source/export path, and actual import syntax.
- Use for / use another component when.
- Default and supported variants; unsupported or planned variants separately.
- Good example from real code and why it fits.
- Bad example from real code and a concrete correction.
- State matrix: state, trigger, appearance, available actions, accessible behavior,
  implementation evidence. Mark irrelevant states N/A with a reason.

Do not include synthetic examples as if they were repository evidence. If there
is no real misuse, a labeled counterexample is sufficient.

## Block record and screen map

- Domain purpose and repeated screens that justify reuse.
- Source path and component composition.
- Inputs/data contract and ownership of async state.
- Applicable loading, empty, error, partial, and success behavior.
- Responsive layout and accessible interaction order.
- State transitions that change copy or actions.

For each screen, list the blocks in reading order, their data sources, and any
new composition needing a design decision. Do not extract a shared abstraction
from a single arbitrary layout without a concrete reason.

## Product rule

```text
Rule: <one observable instruction with its scope>.
Reason: <user need or product consequence>.
Evidence: <approved decision or observed failure>.
```

For example, if a product's run cards support background tasks, it might require
a visible status label because users check progress in passing. Confirm that
requirement for the product before adopting it.

## Review report

For each finding, give severity, location, observed behavior, violated system
contract, and the smallest correction. Keep proposals separate from defects.
Finish with verified states, unverified states, and remaining design decisions.

Useful behavioral scenario for a product with approvals: render a pending request,
approve it, verify the label and actions reflect the confirmed result, and verify
the documented behavior if the mutation fails. Adapt the scenario to the actual
data flow rather than inventing an approval workflow for unrelated products.
