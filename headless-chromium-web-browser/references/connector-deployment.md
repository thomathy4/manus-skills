# Deployment and Manus connector

## Deployment choice

For phone-only users, prefer a hosted HTTPS MCP endpoint. A local stdio server is appropriate only when Manus can start it on the same machine as the browser runtime. A managed cloud browser is simpler for ordinary browsing but does not automatically install a custom extension or apply this sanitizer/staticizer.

## Runtime

Install the pinned MCP SDK, Playwright, BeautifulSoup, and Chromium. Run the MCP server with stdio for local use or Streamable HTTP for a hosted endpoint. Put hosted HTTP behind TLS, authentication, rate limits, request-size limits, health checks, and resource quotas.

## MCP contract

Expose a verification-only tool and a fetch tool with an explicit mode:

```text
verify_domain_consistency(url, allow_subdomains=false)
fetch_page(url, mode=static_only|rendered_snapshot|partially_reconstructed, allow_subdomains=false, include_css=false, max_bytes=...)
```

Require explicit caller opt-in before `rendered_snapshot` or `partially_reconstructed`. Return mode, completeness, sanitized HTML, provenance, omissions, warnings, and blocked-resource details. Never return original executable JavaScript.

## Connector draft

Replace the placeholder URL only after deployment:

```json
{
  "mode": "url",
  "description": "Fetch requested domains through a domain-locked headless Chromium service with JavaScript-disabled retrieval, explicit bounded DOM staticization, sanitized HTML, and provenance hashes.",
  "mcpServers": {
    "headless-chromium-web-browser": {
      "url": "https://your-host.example/mcp"
    }
  }
}
```

Register with `manus-config connector create --file <draft>`. Use form mode when custom authorization headers are required. Keep tokens in connector headers or server secrets, never as tool arguments.

## Activation verification

After registration, confirm that Manus can discover both tools, call the verification tool on a public test domain, observe same-origin blocking, retrieve a `static_only` result, and explicitly opt into a rendered test fixture. Do not claim the connector is active until endpoint reachability and tool discovery succeed. Document disablement, key rotation, dependency updates, browser patching, logs, retention, and rollback.
