# Security

## OpenRouter API Key

Foolery integrates with [OpenRouter](https://openrouter.ai) for access to AI models. This requires an API key which is sensitive and must be protected.

### How the key is stored

- The API key is stored in the OS keychain (macOS Keychain / Linux secret-service) when available, with a fallback to `~/.config/foolery/settings.toml`.
- When stored on disk, the settings file is restricted to owner-only access (mode `0600`).
- The key is never committed to version control — `settings.toml` is in `.gitignore`.

### Server-side only

- The full API key is only accessible on the server side (Next.js API routes).
- The settings API returns a masked version (e.g., `sk-or-...xxxx`) to the browser.
- The browser only sends the key during initial entry or update — it never receives the full key back.

### What is NOT protected

- **Localhost transport**: The key travels over `http://localhost` between the browser and the Next.js dev server. This is not encrypted but is only accessible on the local machine.
- **Memory**: The key exists in server process memory while the app is running.
- **Keychain fallback**: If the OS keychain is unavailable, the key falls back to plaintext file storage (with 0600 permissions).

### Best practices

1. **Use a scoped key**: Create a dedicated OpenRouter API key with minimal permissions for use with Foolery. Do not reuse keys from other applications.
2. **Rotate regularly**: Rotate your API key periodically at [openrouter.ai/keys](https://openrouter.ai/keys).
3. **Set a spend limit**: Configure a spending limit on your OpenRouter account to cap unexpected usage.
4. **Review the in-app explainer**: Click "Is This Secure?" in the OpenRouter settings section for a current assessment.
