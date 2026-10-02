# Security / 보안

## Reporting a vulnerability / 취약점 신고

Please report security issues privately with GitHub's **"Report a vulnerability"** button on the repository's *Security* tab,
not in a public issue. Include the version (`bulc_connection_status` prints it), your MCP client and OS, and the steps to
reproduce. Do not include customer drawings or project files.

보안 문제는 공개 이슈가 아니라 저장소 *Security* 탭의 **Report a vulnerability** 로 비공개 신고해 주십시오. 버전, MCP 클라이언트, 운영체제,
재현 절차를 적어 주시고 고객 도면·프로젝트 파일은 첨부하지 마십시오.

## Security model

- **Local only.** The server speaks MCP over stdio to its parent process and HTTP to the BULC bridge on `127.0.0.1`. It refuses
  bridge hosts that are not loopback unless `BULC_MCP_ALLOW_REMOTE=1` is set.
- **The bridge protects itself.** The BULC app binds the bridge to `127.0.0.1` and rejects requests that carry an `Origin`
  header, a foreign `Host` header, or a non-JSON body, so web pages in a browser cannot drive it. This server sends neither an
  `Origin` header nor non-JSON bodies.
- **Identification.** The server checks that the program answering on the bridge port looks like BULC (`/health` shape) before it
  uses the live tool list, and reports a foreign program instead of forwarding calls to it blindly.
- **Discovery file and token.** The app writes `BULC/bridge.json` (address, pid, token) in the user's config folder with owner-only
  permissions. The server accepts it only for a loopback address, ignores it when the writing process has ended, and sends the token
  (`Authorization: Bearer`) only to that address. With `BULC_BRIDGE_AUTH=sensitive|all` the app refuses file and run tools (or all
  calls) without the token.
- **Files.** The server reads only paths given by the user (drawings ≤ 40 MiB are inspected header-first; decks ≤ 4 MiB),
  screenshot PNGs ≤ 4 MiB returned by the app and the discovery file. It never writes files itself; app tools that write files say
  so in their descriptions, and the app checks their paths (absolute only, extension, system folders, overwrite confirmation).
- **Runs need consent.** `sim_start` and `evac_run` refuse without `confirm: true`; the knowledge pack tells models to ask the user
  first (GEN-016, EVAC-004).
- **External transfer.** Only `rewrite_fds_via_ai` on BULC 0.88 and older sends data to an AI provider (the one configured in the
  app). It is annotated with `openWorldHint` and can be hidden with `BULC_MCP_HIDE_TOOLS`.
- **Supply chain.** One runtime dependency (`@modelcontextprotocol/sdk`). CI fails on copyleft licences and scans the repository for
  paths, e-mail addresses, keys and tokens before release.

## Supported versions

Security fixes are made on the latest 4.x release.
