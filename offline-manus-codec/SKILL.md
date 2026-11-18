---
name: offline-manus-codec
description: Use when designing or implementing offline-first storage for Manus-like conversations, skills, prompts, tool results, or local AI caches, especially when reversible integer encoding, token dictionaries, deduplication, exact restoration, or block-level integrity is required.
---

# Offline Manus Codec

Design a lossless, offline-first storage layer for conversations, skill files, prompts, tool results, and related cache data. Treat the proposed integer representation as a serialization layer; obtain actual size reduction from exact repetition, dictionary substitution, deduplication, sparse representations, and standard entropy coding.

## Scope boundary

This skill designs a codec and storage format. It cannot make the existing cloud Manus Android app or cloud AI services run offline. Clearly distinguish:

- **Local-capable:** cached data, dictionaries, indexes, codec operations, file organization, and any locally installed model/runtime.
- **Online-required:** cloud reasoning, web search, remote integrations, server-side tools, and synchronization.

## Required invariants

1. Preserve an escape path for arbitrary bytes: unknown data must be stored as literal bytes.
2. Require exact dictionary identity and version; never decode with a guessed dictionary.
3. Store original length, encoding mode, dictionary chain, and a cryptographic hash per block.
4. Keep data independently decodable in bounded blocks; do not make an entire database one enormous integer.
5. Separate concerns: tokenization/compression reduces size, hashes detect corruption, encryption protects confidentiality, and authentication detects tampering.
6. Measure total package size, including dictionaries, metadata, indexes, checksums, and encryption overhead.
7. Never claim compression merely because one particular integer has a small decimal value.

## Storage architecture

Use this hierarchy:

```text
core dictionary
  → content-type dictionary
    → project/workspace dictionary
      → file-local dictionary
        → independently decodable data blocks
```

Recommended content types:

- `conversation`: messages, roles, content parts, attachments, parent links, timestamps.
- `skill`: YAML frontmatter, Markdown structure, exact instructions, examples, references.
- `tool-result`: request/response envelopes, status, errors, repeated JSON structures.
- `project`: repeated paths, terminology, URLs, prompts, and project-specific fragments.

Use immutable dictionaries for existing files. When a dictionary changes, create a new version and keep old versions available for old blocks.

## Efficiency toolkit

Apply these transforms before final integer serialization, and retain each one only when the complete package becomes smaller:

- **Content-addressed deduplication:** hash exact messages, tool results, attachments, chunks, or immutable snapshots; store identical bytes once and reference them. Treat encryption and privacy implications explicitly.
- **Structural templates:** store recurring conversation envelopes, tool-result JSON, skill frontmatter, or Markdown sections once; encode only changing fields. Preserve field order in exact mode.
- **String interning:** maintain global, project, and file-local tables for repeated paths, URLs, roles, MIME types, model names, and tool names. Evict or omit a table when its metadata costs more than its savings.
- **Delta and front coding:** encode timestamp gaps, numeric IDs, path suffixes, and sorted-string shared prefixes against a declared base value or predecessor.
- **Run-length and sparse fields:** encode repeated values as `(value, count)` and optional fields with presence bitmaps instead of serializing absent values.
- **Shared immutable snapshots and copy-on-write:** reference unchanged system prompts, skill/tool-schema versions, conversation branches, and snapshots; write only changed blocks.
- **Content-defined chunking:** use rolling-fingerprint boundaries for frequently edited files so insertion or deletion does not shift all later chunks; combine with content hashes.
- **Similarity grouping:** encode conversations, tool results, skills, source, and already-compressed/binary attachments in separate segments with type-appropriate dictionaries.
- **Entropy coding:** apply Huffman, range/arithmetic coding, Brotli, or Zstandard after structural tokenization and run/delta transforms, never as a substitute for exact literal escapes.

Use content-independent generated recipes for stable core/content-type dictionaries. For project/file-local dictionaries, store a deterministic recipe input hash plus only profitable deltas. Deterministic candidate ordering and dictionary identity are mandatory.

## Token design

Use logical namespaces with variable-length integer encoding:

| Logical range | Meaning |
|---:|---|
| 0–255 | literal byte values |
| 256–511 | core dictionary |
| 512–767 | conversation dictionary |
| 768–1023 | skill dictionary |
| 1024–1279 | tool-result dictionary |
| 1280–2047 | project dictionary |
| 2048–4095 | file-local dictionary |
| 4096+ | control and future extensions |

Reserve control tokens for literal runs, UTF-8 literals, raw bytes, repeat runs, message/field/object/array boundaries, dictionary switches, checkpoints, and block termination. Every token stream must support `LITERAL_BYTES + length + bytes`.

Dictionary entries should declare:

```text
id, namespace, kind, exact value or parts, byte length,
flags, optional frequency/benefit statistics, checksum
```

Supported kinds include `literal`, `field-name`, `role`, `markdown`, `url`, `code`, `json-fragment`, `byte-sequence`, `template`, and `reference`. Semantic descriptions are not lossless replacements; store exact text or bytes when byte-for-byte restoration is required.

## Encoding workflow

1. Identify the source type and whether exact bytes or normalized content must be restored.
2. Canonicalize only when explicitly allowed. Otherwise preserve UTF-8 bytes, line endings, field order, Markdown spacing, code fences, and trailing newline state.
3. Group similar records and choose shared scope: global, project, file, snapshot, or block.
4. Resolve immutable generated dictionaries; mine project/file candidates and retain only positive-savings deltas.
5. Deduplicate exact objects/chunks, then apply templates, interning, front/delta coding, sparse fields, and run-length coding where applicable.
6. Split into independently decodable bounded blocks, such as 64 KiB, while respecting record or content-defined boundaries where practical.
7. Emit structural tokens and exact dictionary references; emit literal runs for unique or unknown material.
8. Apply standard entropy coding only when it reduces total package size.
9. Optionally serialize the final token bitstream as one non-negative integer per block. Store bit length and leading-zero information; the integer value alone is insufficient.
10. Store the dictionary/snapshot chain, dedup references, transform modes, block header, payload, decoded SHA-256, and optional authentication tag.
11. Decode immediately and compare the recovered hash with the source hash before marking the block valid.

## Conversation representation

Represent conversations structurally before tokenization:

```text
conversation_id
message_id
role: system | user | assistant | tool
content parts: text | image | audio | file | tool_call | tool_result
created_at, updated_at, parent_message_id
attachments and metadata
```

Tokenize repeated field names, roles, content-type labels, status values, and recurring JSON envelopes. Keep unique message text as exact UTF-8 literal data unless repetition justifies a local entry.

## Skill-file representation

Preserve the following when exact restoration is required:

- YAML frontmatter and field order
- Heading levels and Markdown markers
- Blank-line count and indentation
- Code-fence language
- Reference paths
- Exact line endings and final newline

Tokenize recurring structural markers such as frontmatter delimiters, headings, bullets, code fences, `Use when`, `Required`, and tool-schema fields only when the total package becomes smaller. Support an explicit `exact` mode and an optional `normalized` mode; never silently normalize.

## Dictionary selection rule

For each candidate sequence, estimate:

```text
total_savings =
  occurrences × (literal_size - reference_size)
  - dictionary_entry_size
  - entry_metadata_size
```

Add it only if `total_savings` exceeds a configured threshold. Shared dictionaries are worthwhile across many files; file-local dictionaries are worthwhile only for frequent long sequences.

For every transform, use the same accounting rule:

```text
net_savings = raw_bytes - (encoded_bytes + references + dictionaries + recipes
                           + indexes + hashes + encryption/authentication overhead)
```

Keep a transform only when `net_savings > 0`, unless the explicit benefit is integrity, random access, resumability, deduplication, or portability. Never count a generated dictionary as free unless the decoder already has the exact generator and version.

## Block header minimum

Include:

```text
magic, format_version, source_type, block_sequence,
original_byte_length, encoded_bit_length, dictionary_chain_id,
encoding_mode, payload_length, decoded_sha256,
optional authentication_tag
```

Use a deterministic binary header in production and a JSON diagnostic view for debugging.

## Validation checklist

Test with short and long conversations, shared versus separately packaged corpora, similar skill files, unique prose, random bytes, JSON, source code, images, and already-compressed attachments. Compare fixed-size versus content-defined chunking when edits are expected. Exercise duplicate objects, snapshot branches, templates, intern tables, deltas, sparse fields, run-length coding, and entropy coding independently. Record original size, dictionary/recipe size, dedup index size, transform metadata, payload size, block overhead, total size, encode/decode time, break-even point, and hash match. Confirm that corrupt blocks are rejected, dictionary mismatches fail closed, and unrelated blocks remain readable.

Do not pass generic integer encoding off as compression. Compare the complete package against the original and retain the encoded form only when it is actually smaller or provides another explicit benefit such as deduplication, integrity, or portability.
