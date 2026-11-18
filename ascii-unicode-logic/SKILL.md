---
name: ascii-unicode-logic
description: Encode, decode, and convert Unicode text and sentential-logic formulas using a reversible ASCII escape code. Use when the user requests ASCII Unicode logic encoding, ESC or visible-form conversion, code-point checking, or says use the logic code.
metadata:
  runtime: "Python 3.8+ standard library; no network or dependencies; text-only fallback available."
  version: "1.0.1"
  unicode-version: "18.0.0"
  upstream: "thomathy4/ascii-unicode-code"
---

# ASCII Unicode Logic Code

Use the bundled script for exact conversion. Treat this as a custom ASCII serialization, not a standard ANSI terminal encoding, encryption, or compression format.

## Execute

Resolve `scripts/ascii_unicode_code.py` relative to this SKILL.md, not the shell's current directory. Save exact input as UTF-8 bytes when line endings matter. Do not add an unintended trailing newline.

Run from the skill root:

```sh
printf '%s' '¬(p ∧ q) → r' | python3 scripts/ascii_unicode_code.py --mode both encode --form visible
```

Expected output: `\u00AC(p \u2227 q) \u2192 r`.

Use `encode --form esc` for real ESC bytes. Use `decode --form visible` or `decode --form esc` with the known source form. Use `convert --to visible` on ESC input and `convert --to esc` on visible input. Put global `--mode both|esc-only|visible-only` before the subcommand. Run the script's `--help` for file/output options.

Always prefer explicit decoding forms. `auto` chooses ESC if a real ESC byte is present, otherwise visible; an ASCII-only ESC stream containing literal backslash escapes is ambiguous. Do not promise automatic detection or mixed-format decoding is lossless.

## Preserve exact text

The ESC grammar is byte 0x1B + `[U` + 4 uppercase hex digits for BMP or 6 for astral + `m`. The visible grammar is `\u` + 4 hex digits for BMP, or `\U` + 8 for astral. Example: 😀 becomes `\U0001F600` and real ESC + `[U01F600m`.

Printable ASCII stays literal, except a visible-form backslash becomes `\\`. Space stays literal; LF stays literal by default; CR is always encoded. Use `--no-preserve-newlines` to encode LF too. Reject surrogate code points U+D800–U+DFFF and values outside U+0000–U+10FFFF. Preserve combining sequences, controls, private-use values, and unassigned scalar values without normalization.

Keep `--logic`, `--logic-long`, and `--aliases` off for lossless general text. Enable only when the user requests the corresponding formula notation. `T` can mean a variable or verum; use canonical escapes to avoid this ambiguity. Aliases are not a lossless serialization of arbitrary text.

## Present and verify

Show input, mode, ESC representation, visible form, and decoded round-trip on separate labeled lines. Show ESC as an explicitly labeled display transcription using `<ESC>`, or as hexadecimal bytes; never print raw ESC or decoded controls into a terminal. `<ESC>` is not a reversible wire format. If the input contains that literal placeholder, show byte values to avoid confusion.

Encode and decode with matching explicit forms, then compare the recovered UTF-8 bytes with the input. For conversion, compare both directions. Report errors without guessing or dropping characters. Never claim a test ran if only quoting an expected result.

Read [SPEC.md](references/SPEC.md) for exact grammar and review corrections, [HOWTO.md](references/HOWTO.md) for commands, and [SYMBOLS.md](references/SYMBOLS.md) or [logic_mapping.csv](references/logic_mapping.csv) for all 18 symbol definitions. Read [PROVENANCE.md](references/PROVENANCE.md) for source revision, licensing status, and portability limitations.

## Without Python

Use the small logic CSV and symbol reference. Explain that the result was table-derived, not script-verified. For another character, give a name/code point only when certain; otherwise say `unknown — run the script`. Do not fabricate a Unicode-version-specific name. Do not use the large mapping as chat knowledge. The portable prompt is [compact-prompt.txt](references/compact-prompt.txt); paste it only into a user-selected app or project, not automatically into account-wide instructions.
