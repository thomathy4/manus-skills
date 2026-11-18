---
name: offline-codec-engineering
description: Use when designing, implementing, benchmarking, or reviewing offline-first codecs for conversations, skills, prompts, tool results, caches, or local archives where exact restoration, deduplication, dictionary design, and complete-package efficiency matter.
---

# Offline Codec Engineering

Design a lossless, offline-first storage layer and prove that it is useful with a runnable benchmark. Treat integer encoding as a serialization layer, not as compression by itself.

## Non-negotiable boundaries

- **Local-capable:** codec operations, cached data, dictionaries, indexes, deduplication, integrity checks, and any locally installed runtime.
- **Online-required:** cloud reasoning, web search, remote integrations, and synchronization unless explicitly implemented locally.
- Preserve arbitrary bytes with a literal escape path.
- Require exact dictionary identity/version; never decode with a guessed dictionary.
- Decode independently bounded blocks; do not make the database one enormous integer.
- Separate compression, integrity, authentication, encryption, and synchronization.
- Measure the complete package: payload, recipes, dictionaries, indexes, hashes, headers, and encryption/authentication overhead.

## Reusable process

1. **Define restoration and scope.** Decide exact byte restoration versus explicit canonical mode. Record content types, record boundaries, block size, and whether the corpus is shared or separately packaged.
2. **Write the smallest runnable baseline.** Represent conversations, skills, tool results, and attachments structurally before tokenization. Include `LITERAL_BYTES + length + bytes` from the first version.
3. **Add deterministic dictionaries.** Generate stable core/content-type dictionaries from short, versioned recipes. Mine project/file candidates from exact bytes; retain a candidate only when its net savings clear a threshold. Use deterministic tie-breaking and store a dictionary hash plus input hash for derived recipes.
4. **Add one efficiency at a time.** Evaluate content-addressed deduplication, structural templates, string interning, delta/front coding, run-length coding, sparse presence bitmaps, immutable snapshots/copy-on-write, and content-defined chunking. Group similar content types before applying type-specific dictionaries.
5. **Apply entropy coding last.** Use a standard coder such as Zstandard, Brotli, range coding, or Huffman only after structural transforms and only if the full package shrinks.
6. **Emit bounded blocks.** Store magic, format version, source type, sequence, original length, encoded bit length, dictionary chain, encoding modes, payload length, decoded SHA-256, and optional authentication tag. Keep a JSON diagnostic view alongside a deterministic binary representation.
7. **Decode immediately.** Compare restored bytes and per-block hashes before marking data valid. Test a flipped payload bit, wrong dictionary version, truncated literal, missing reference, and an unrelated-block read.
8. **Benchmark break-even.** Generate or load a documented corpus spanning 1, 2, 4, 8, … records. Compare shared-dictionary packaging with separate per-record packaging. Report raw bytes, payload bytes, dictionary/recipe bytes, block overhead, total bytes, ratio, savings, encode/decode time, and the first corpus size where total package bytes are below raw bytes.
9. **Deliver source and evidence.** Provide the codec source, benchmark script, machine-readable results, and a concise explanation of assumptions and known limits. Do not claim compression from a small decimal integer or from payload size alone.

## Recommended hierarchy

```text
core recipe
  → content-type recipe
    → project/workspace delta
      → file-local delta
        → deduplicated objects/chunks
          → independently decodable blocks
```

Use immutable dictionary versions. Store old versions for old blocks. Generated entries are not free unless the decoder already has the exact generator and version; otherwise count their serialized cost.

## Candidate-selection rule

For every candidate or transform, calculate:

```text
net_savings = raw_bytes - (
  encoded_bytes + references + dictionaries + recipes + indexes
  + block_headers + hashes + encryption/authentication overhead
)
```

Keep it only when `net_savings > 0`, unless the explicit benefit is integrity, random access, resumability, deduplication, or portability. Apply the same accounting to templates, intern tables, snapshots, and chunk indexes.

## Content-specific guidance

- **Conversations:** tokenize roles, field names, content-part types, statuses, recurring envelopes, shared system/skill/tool snapshots, and exact repeated messages. Keep unique prose as UTF-8 literals.
- **Skills and Markdown:** preserve YAML field order, heading levels, blank-line count, indentation, fence language, reference paths, line endings, and final-newline state in exact mode. Offer normalization only as an explicit mode.
- **Tool results:** tokenize repeated JSON envelopes, status/error values, schemas, URLs, and MIME types; use sparse fields for optional diagnostics.
- **Attachments and binaries:** deduplicate by content hash, preserve literal bytes, and avoid pretending already-compressed data will shrink. Document encryption/deduplication tradeoffs.

## Validation checklist

Test short and long data, repeated and unique prose, random bytes, JSON, source code, images, already-compressed attachments, duplicate objects, edited files, snapshot branches, wrong dictionaries, truncated blocks, and corrupted payloads. Verify exact restoration, hash matches, independent block readability, deterministic dictionary regeneration, and complete-package break-even. Keep the encoded form only when measured total size or an explicit non-size benefit justifies it.
