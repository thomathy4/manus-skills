# Interleaved Byte-Integer Wire Format

Use this reference when implementing or reviewing the codec.

## Logical records

For each byte at 1-based position `i`:

```text
location = 2 × i
bit7, bit6, bit5, bit4, bit3, bit2, bit1, bit0
```

Emit eight records in that order:

```text
unsigned-varint(location), 0-or-1
```

The bit value is one complete byte in the wire format, not a packed bit, so parsing remains unambiguous.

## Framing

A concrete versioned wire layout is:

```text
marker 1 byte
magic/version 4 bytes: ASCII IBI1
length unsigned varint
8 × (location unsigned varint + bit byte), repeated length times
SHA-256 of reconstructed bytes: 32 bytes
```

The outer `marker` is `0x01`. Construct the integer from the complete marked wire byte array using a positive-sign constructor. On decode, obtain the unsigned magnitude bytes, require the marker, and remove it before parsing the inner wire format.

## Unsigned varint

Use 7 payload bits per byte. Set the high bit when another byte follows. Reject more than 10 bytes for a `Long`, overflow, and premature end of input.

## Decode algorithm

1. Require a positive integer.
2. Convert its magnitude to bytes and remove only a synthetic sign byte inserted by the integer library.
3. Require marker `0x01` and magic/version `IBI1`.
4. Read the declared length.
5. For each byte position `i`, read eight `(location, bit)` records.
6. Require every location to equal `2 × i`; reject any other location.
7. Shift each bit into the output byte from most significant to least significant.
8. Read exactly 32 digest bytes and require end-of-input afterward.
9. Compare SHA-256 of output bytes to the stored digest.

## Example

For one byte `0xB4` (`10110100`) at position 1:

```text
location numeral = 2
records = (2,1), (2,0), (2,1), (2,1),
          (2,0), (2,1), (2,0), (2,0)
```

The byte is reconstructed as `0xB4`. The decoder does not need the source file or any external metadata.

## Storage guidance

The decimal form `integer.toString()` is suitable for human-readable persistence but is large. For compact persistence, store the integer's unsigned magnitude bytes or the decimal value in a database field that supports arbitrary precision. Never use a fixed-width integer type.
