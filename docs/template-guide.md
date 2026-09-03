# Google Slides Template Design Guide

## Dynamic Fields

Four dynamic placeholders are supported in Google Slides templates.

**Required** (validation fails without them, each exactly once):

1. `{{name}}` — Full name formatted from `prefixName + firstName + " " + lastName`
2. `{{certNo}}` — Formatted Certificate Number (e.g. `เลขที่ สพม.พลอต ๒๒๒๑/๒๕๖๙`)

**Optional** (use them only if the design needs them; each at most once):

3. `{{office}}` — สถานศึกษา/หน่วยงาน of the recipient (the `school` column of the import file)
4. `{{type}}` — ด้านการอบรม (e.g. `ด้านการอ่าน`, `ด้านคณิตศาสตร์`). Taken from the recipient's own
   value, falling back to the activity-level default when the imported row leaves it blank.

A template that does not contain `{{office}}`/`{{type}}` is unaffected — nothing is inserted.

## Slide Layout Rules

- Exactly **1 main slide** per presentation file.
- `{{certNo}}`: Placed at top-right, right-aligned text.
- `{{name}}`: Placed at center horizontal band, center-aligned text.
- `{{office}}` / `{{type}}`: Usually placed in the citation line below the name. Give the text box
  enough width for the longest school name / training subject you expect.
- Standard background, logos, and signatures can be statically placed.
