# Environment observations

- Initial npm install failed because the inherited package-lock.json uses https://bnpm.byted.org tarball URLs, which do not resolve here. npm configured registry is already https://registry.npmjs.org/. GLM should migrate resolved tarball URLs to the public registry while preserving exact versions/integrities, then install and verify. Do not repeatedly retry the unreachable inherited registry.
- GLM smoke request succeeded with model glm-5.3-flash. Kit quota query unavailable; no claim about remaining free tokens.
- Sol smoke request succeeded with model gpt-6-sol/provider openai. WebSocket transport initially timed out, CLI automatically fell back to HTTPS and returned SOL_OK. Allow this fallback; do not change global authentication or provider settings.
- Chrome exists at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome.
