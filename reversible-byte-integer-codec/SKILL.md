---
name: reversible-byte-integer-codec
description: Design and implement exact reversible encodings that represent arbitrary byte sequences as one positive arbitrary-precision integer, including interleaved location-and-bit records, self-contained decoding, integrity checks, Kotlin/Android integration, and round-trip tests. Use when a user wants to turn files or binary data into a single integer and recreate the original bytes without retaining the source file.
---

# Reversible Byte-to-Integer Codec

Use this skill when a binary payload must be represented by one positive integer and later reconstructed from that integer alone.

## Non-negotiable properties

- Make the encoding **injective**: every accepted byte sequence maps to exactly one integer.
- Put all information needed for decoding inside the integer. Do not depend on the original file, filename, MIME type, external length, or sidecar metadata.
- Preserve byte order, bit order, sequence length, and leading zero bytes.
- Use arbitrary-precision integers (`BigInteger` on the JVM), never `Long` or `Int` for the complete payload.
- Validate malformed or modified payloads rather than returning plausible bytes.
- State clearly that exact representation is not compression; repeated location records usually expand data.

## Default interleaved format

Use the following format unless the user explicitly specifies a different one. Details are in `references/format.md`.

1. Treat each byte as an ordered unit with a 1-based position `i`.
2. Assign its location numeral `L = 2 × i`.
3. Emit eight ordered records for the byte, most-significant bit first: `unsignedVarInt(L), bit(0 or 1)`.
4. Prefix a magic/version marker and the byte count.
5. Append a cryptographic digest, normally SHA-256, of the reconstructed bytes.
6. Prefix the serialized wire bytes with a nonzero marker before constructing `BigInteger(1, markedWire)`.
7. Decode by converting the positive integer back to unsigned bytes, checking the marker and format header, reading exactly the declared number of bit records, checking every location numeral, checking the digest, and rejecting trailing bytes.

The location numeral is deliberately repeated before every bit to match the requested interleaving scheme. If a compact mode is needed, derive location from order rather than storing it repeatedly, but label that as a different format/version.

## Implementation workflow

1. **Specify the bijection first.** Define units, position numbering, byte/bit ordering, length framing, marker behavior, integer sign handling, and corruption behavior before coding.
2. **Write tests first.** Add a minimal byte-array round-trip test, a leading-zero test, an empty-input test, a multi-byte/location test, a tamper rejection test, and a file round-trip test. Run them and observe the expected failure before implementation.
3. **Implement the smallest codec.** Keep serialization deterministic. Use bounded unsigned varints for lengths and location numerals. Reject overflow, truncated varints, invalid bit values, wrong locations, bad magic, bad markers, bad checksums, and trailing data.
4. **Add file adapters separately.** `encodeFile` may read bytes into memory for a prototype; `decodeToFile` must write only the bytes recovered from the integer. For large videos, design a versioned streamed/container format instead of pretending `BigInteger` is memory-efficient.
5. **Verify fresh.** Compile the production code and tests, run the complete suite, and confirm an output byte-for-byte comparison or SHA-256 match. Do not claim completion from inspection alone.
6. **Document storage choices.** Decimal text is human-readable but large; binary magnitude bytes or a database blob is more compact. Never truncate or coerce the integer into a fixed-width numeric type.

## Kotlin/JVM guidance

- Use `java.math.BigInteger(1, bytes)` to force a positive sign.
- When converting back, remove only BigInteger's synthetic leading sign byte (`0x00`) if present; never remove legitimate payload bytes.
- Use `MessageDigest` for SHA-256 verification.
- Keep the codec independent of Android UI and media playback. Android can copy a `ContentResolver` URI to an app-private `File`, call the core codec, and later pass the restored file to Media3/ExoPlayer or another player.
- For a large video, warn about memory and integer-size costs before offering this as storage compression.

## VLC-like Android playback layer

Keep playback as a separate module from encoding and decoding. Restore the bytes to a playable app-private file, then hand that file to a media player rather than making the codec responsible for codecs or rendering.

- Prefer Android Media3/ExoPlayer for the primary player, with a VLC Android SDK/libVLC backend when broad container and codec coverage is required.
- Support play/pause, stop, seek, duration, current position, buffering state, volume, mute, playback speed, fullscreen, orientation, picture-in-picture, repeat, shuffle, and playlist navigation.
- Expose audio-track, subtitle-track, and video-track selection when the backend supports them; preserve embedded subtitle and metadata behavior.
- Use Android `ContentResolver`/Storage Access Framework for import and export rather than assuming filesystem paths.
- Keep restored files in app-private storage until playback is ready; delete temporary decoded files only after the player releases them.
- Add lifecycle handling: pause/release on background as appropriate, restore position after recreation, and handle audio focus, noisy-audio events, rotation, and headset/Bluetooth changes.
- Treat unsupported formats as a player/backend problem, not an encoding failure. Report whether failure occurred during integer decoding, file writing, container parsing, or codec initialization.
- Test playback with representative MP4, AVI, FMV, variable-frame-rate, audio-only, subtitle, corrupt, and unsupported files. Do not claim VLC compatibility without testing the selected backend and licenses.

Do not put player state, thumbnails, or UI controls into the mathematical integer payload. Store them as application metadata keyed by a digest or encoded-object identifier; the original media bytes must still be recoverable from the integer alone.

## Mathematical warning

A sum of per-bit or per-position values is not enough unless the full representation is proven collision-free and framed. Different sequences can have the same sum. Use ordered serialization plus a length/header, then convert that serialization to one integer.

## Completion checklist

- [ ] Same bytes after `decode(encode(bytes))`.
- [ ] Leading zero bytes survive.
- [ ] Empty input has a defined result.
- [ ] Integer is strictly positive.
- [ ] Decoding uses only the integer and codec.
- [ ] Wrong location, checksum, marker, length, and trailing data are rejected.
- [ ] Tests were observed failing before implementation and pass afterward.
- [ ] Size/compression limitations are documented.
