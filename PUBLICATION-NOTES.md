# Publication notes

This collection contains the 10 skills marked as created by the user in the Manus task on November 17, 2026. It does not include Manus's built-in skills or the user's separate, pre-existing Notion skill collection.

All supporting scripts, references, templates, and existing metadata files are included. Compiled Python cache files are excluded. The installed source skills are unchanged.

## ADHD metadata compatibility adjustment

The publication copy of `i-have-adhd/SKILL.md` moves the unsupported top-level `disable-model-invocation: true` field to `metadata.source-disable-model-invocation: true`. An explicit instruction preserves its manual-activation intent: activate only on the user's request; do not activate automatically. No other skill instructions are changed.

## Validation and privacy

All 10 publication copies pass the Manus skill-creator packaging validator. This checks packaging and metadata, not execution of each workflow or the safety of all bundled code. A pattern-based text scan found no obvious embedded credentials. No private Notion content, account configuration, or runtime secrets are included.

## Manus distribution

Manus's documented public community sharing route is GitHub. Its official library is curated; no self-service official-library submission process was found. Download each `.skill` package and use Skills > Add > Upload a skill. Each package has SKILL.md and its own resources at the archive root, so it can be imported independently. Do not treat the entire multi-skill repository as one skill.

## Licensing

Existing per-skill license declarations and attribution are preserved. This repository adds no repository-wide license and grants no new blanket license over all included material.
