# JavaScript staticization policy

## Core rule

Do not promise JavaScript-to-HTML equivalence. HTML can represent structure and inert state; JavaScript represents computation, side effects, time, network, user input, and future state. The service may freeze one observed result, not preserve the original program.

## Staged process

1. Fetch and sanitize with JavaScript disabled.
2. If the requested data is absent because of hydration, require explicit rendered mode.
3. Render in a disposable context with a same-origin egress policy, bounded readiness condition, fixed or recorded environment, and capability instrumentation.
4. Capture the post-hydration DOM, safe visible state, accessibility attributes, safe links, and deterministic GET-derived data.
5. Sanitize the captured DOM, destroy the browser context, hash raw/rendered/sanitized artifacts, and emit omissions.

## Usually safe to freeze

- Server-rendered or hydrated structural markup
- Visible text and accessible names
- ARIA attributes and labels
- Same-origin ordinary hyperlinks after URL checks
- Form controls and constraints when submission is disabled
- Media metadata and bounded image references
- Deterministic GET response data with recorded request, response, host, status, size, and hash
- Inert CSS only when explicitly requested and same-origin

## Must be omitted or represented as metadata

- Event handlers and inline listeners
- Timers, animation frames, mutation observers, and deferred callbacks
- WebSockets, WebRTC, server-sent events, and live streams
- Client-side routing and route-loader behavior
- Client-side validation and custom form serialization
- Canvas/WebGL drawing logic and future frames; an image capture may be separate, but it is not HTML behavior
- Clipboard, downloads, popups, permissions, storage export, geolocation, camera, and microphone
- Any POST/PUT/PATCH/DELETE or other state-changing request unless a separate reviewed action API handles it

## Required result labels

Use `static_only` when no JavaScript ran; `rendered_snapshot` when one bounded DOM state was captured; `partially_reconstructed` when state was frozen but meaningful behavior was omitted; and `blocked` when policy prevents a safe result. Include `completeness` and an `omissions[]` list in every response.

## Authenticity language

A rendered snapshot is evidence of what the approved origin returned under the recorded conditions. It is not proof that the page is authentic in the broader sense, factually correct, complete, current, or free from compromised dependencies. Provenance hashes authenticate observed bytes and transformations, not truth.
