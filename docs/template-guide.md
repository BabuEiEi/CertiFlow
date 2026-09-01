# Google Slides Template Design Guide

## Dynamic Fields

Only two dynamic placeholders are allowed in Google Slides templates:

1. `{{name}}` — Full name formatted from `prefixName + firstName + " " + lastName`
2. `{{certNo}}` — Formatted Certificate Number (e.g. `เลขที่ สพม.พลอต ๒๒๒๑/๒๕๖๙`)

## Slide Layout Rules

- Exactly **1 main slide** per presentation file.
- `{{certNo}}`: Placed at top-right, right-aligned text.
- `{{name}}`: Placed at center horizontal band, center-aligned text.
- Standard background, logos, and signatures can be statically placed.
