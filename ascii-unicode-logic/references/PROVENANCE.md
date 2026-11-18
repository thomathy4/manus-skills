# Source and portability

This skill adapts the two user-supplied installation documents and the public repository [thomathy4/ascii-unicode-code](https://github.com/thomathy4/ascii-unicode-code), inspected at revision `7b5370ec1a2e71b1105bd5a10799585983c80c69` on 17 November 2026.

The upstream codec declares version 1.0.0 and Unicode 18.0.0. The bundled codec is the locally reviewed 1.0.1 revision. Fixes preserve literal escape-looking text in automatic decoding when ESC is present, repair adjacent compact logic operators, enforce T token boundaries, reject negative values/wrong-width ESC sequences/non-ASCII visible input, preserve output line endings, and provide clear CLI errors. Exact work uses explicit decoding forms. The original upstream test suite and additional regression tests passed in Python 3.12.3.

The code operates on Unicode scalar values without needing a mapping file. There are 1,112,064 scalar values; the complete 1,114,112-row code-point mapping includes 2,048 surrogates that the codec rejects. Unicode-version-dependent names are not supplied by Python 3.12's older built-in database. Use the small bundled logic CSV for the defined inventory or a verified mapping outside this skill.

No LICENSE file or license grant was present in the inspected repository. The upload's `license: MIT` skeleton is not evidence of an upstream MIT grant, so it has not been copied into this skill. Preserve attribution and confirm licensing before public redistribution. No external account or GitHub files were modified.

## Install limits

For Manus, use the delivered skill card and add it to My Skills. Creating this folder in a task sandbox and successfully executing it verifies only the local files, not that account-wide installation has happened or that a future chat will discover it. Test the added skill in a new task explicitly by name.

For another coding agent, copy the folder into that host's documented skill directory. The source bundle includes a dry-run-by-default installer requiring an explicit destination. The generic `.agents/skills/` path is a candidate only when the host documents it; it is not a universal install.

For a paste-only app, use compact-prompt.txt in the chosen chat/project. A prompt alone does not install Python or guarantee persistent instructions. Attach small references if the app accepts them. Do not upload the full mapping.

The Muse `skill.yaml` companion is an unverified community-style template retained for optional use. No Muse login, installation, execution, identity-file change, fresh-chat discovery, or persistence test was performed. Do not imply that these were verified. The uploaded guide's pricing, platform rollouts, and account eligibility claims are not validated by this package.
