# Run the small skill

Run these commands from the folder containing SKILL.md, or replace the relative script path with its absolute path. Python 3.8+ is sufficient; no packages or network are required.

## Exact formula

```sh
printf '%s' '¬(p ∧ q) → r' | python3 scripts/ascii_unicode_code.py --mode both encode --form visible
```

Output: `\u00AC(p \u2227 q) \u2192 r`. This example deliberately does not append LF.

## UTF-8 file round trip

```sh
python3 scripts/ascii_unicode_code.py encode --form visible input.txt --output encoded.vis
python3 scripts/ascii_unicode_code.py decode --form visible encoded.vis --output decoded.txt
cmp input.txt decoded.txt
```

A successful `cmp` exits zero and prints nothing. Do not normalize or rewrite the original line endings before comparing.

## ESC bytes and conversion

```sh
python3 scripts/ascii_unicode_code.py encode --form esc input.txt --output encoded.esc
python3 scripts/ascii_unicode_code.py convert --to visible encoded.esc --output converted.vis
python3 scripts/ascii_unicode_code.py convert --to esc converted.vis --output converted.esc
cmp encoded.esc converted.esc
python3 scripts/ascii_unicode_code.py decode --form esc encoded.esc --output decoded.txt
cmp input.txt decoded.txt
```

Store actual ESC bytes in files. Use `od -An -tx1 encoded.esc` for inert hexadecimal display, not direct terminal output. `<ESC>` in a document is only a display placeholder and is not the encoded file.

## Newlines and aliases

Space stays literal. LF stays literal by default; add `--no-preserve-newlines` after encode to encode LF. CR is always encoded. Files are read and decoded outputs are written as bytes.

Use `--logic` for requested compact formula aliases; use `--logic-long` for long symbolic forms, decoded with `--aliases`. Do not enable any alias flags for arbitrary text. `T` may be a variable, and literal `[NOT]` or `~` may be ordinary text; alias mode cannot preserve that distinction automatically.

## Modes and ambiguity

Put global `--mode both|esc-only|visible-only` before the subcommand. Use explicit `--form` for decoding. `auto` chooses ESC if a raw ESC byte occurs, otherwise visible, but cannot distinguish an ASCII-only ESC stream from visible escape-looking text. It is not a mixed-format decoder.

## Errors and lookups

Malformed escape tokens, surrogates and values outside U+0000–U+10FFFF fail with a nonzero CLI result. Extra literal text after a complete fixed-width escape is allowed. Use references/logic_mapping.csv and SYMBOLS.md for the 18 defined symbols. Any large mapping belongs outside the uploaded skill. Consult `--help` and each subcommand's help for available flags.
