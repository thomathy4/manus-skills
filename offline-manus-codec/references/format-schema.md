# Offline Manus Codec: Format Schema

This reference defines a compact logical schema. Production implementations should use a deterministic binary encoding; JSON examples are diagnostic representations.

## Dictionary manifest

```json
{
  "format": "MOF",
  "format_version": 1,
  "dictionary_chain": [
    {"id": "core-v1", "sha256": "..."},
    {"id": "conversation-v1", "sha256": "..."},
    {"id": "project-ab12-v3", "sha256": "..."},
    {"id": "file-9087-v1", "sha256": "..."}
  ]
}
```

Dictionary versions are immutable. New files may use newer dictionaries; old files must remain decodable with the versions recorded in their chain.

## Dictionary entry

```json
{
  "token_id": 512,
  "namespace": "conversation",
  "kind": "field-name",
  "flags": {"case_sensitive": true, "utf8": true},
  "value_length": 7,
  "value": "content",
  "checksum": "sha256:..."
}
```

For a template, replace `value` with ordered literal parts and typed slots. Every slot needs an unambiguous type and boundary.

## Recommended control tokens

```text
TOKEN_LITERAL_RUN
TOKEN_LITERAL_UTF8
TOKEN_LITERAL_BYTES
TOKEN_REPEAT
TOKEN_COPY_PREVIOUS
TOKEN_START_CONVERSATION
TOKEN_END_CONVERSATION
TOKEN_START_MESSAGE
TOKEN_END_MESSAGE
TOKEN_START_FIELD
TOKEN_END_FIELD
TOKEN_START_ARRAY
TOKEN_END_ARRAY
TOKEN_START_OBJECT
TOKEN_END_OBJECT
TOKEN_NULL
TOKEN_TRUE
TOKEN_FALSE
TOKEN_DICTIONARY_SWITCH
TOKEN_CHECKPOINT
TOKEN_END_BLOCK
```

`TOKEN_LITERAL_BYTES` is mandatory for unknown data and future compatibility.

## Conversation logical record

```json
{
  "conversation_id": "conv_01",
  "created_at": "2026-10-31T01:44:20-04:00",
  "messages": [
    {
      "message_id": "msg_01",
      "role": "user",
      "content": [{"type": "text", "text": "..."}],
      "attachments": [],
      "parent_message_id": null
    }
  ]
}
```

Tokenize recurring structure and preserve unique text as exact UTF-8 literals.

## Skill logical record

```json
{
  "skill_id": "offline-storage",
  "name": "Offline Storage",
  "description": "...",
  "triggers": ["offline storage", "local cache"],
  "frontmatter": {"version": "1.0", "read_first": true},
  "sections": [{"heading": "Purpose", "content": "..."}],
  "references": ["/references/storage-format.md"]
}
```

If exact byte restoration is required, additionally preserve line endings, blank lines, indentation, Markdown markers, code-fence language, field order, and final-newline state.

## Block header

Minimum logical fields:

```text
magic
format_version
source_type
block_sequence
original_byte_length
encoded_bit_length
dictionary_chain_id
encoding_mode
payload_length
payload
decoded_sha256
optional_authentication_tag
```

Blocks should be independently decodable and verifiable. A bad block must not make unrelated blocks unreadable.

## Integer serialization

When using a single non-negative integer for a block, store at least:

```text
integer_value
encoded_bit_length
leading_zero_count
encoding_mode
dictionary_chain_id
block_checksum
```

The integer value alone loses leading-zero information and cannot identify the decoding scheme.
