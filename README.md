# Sidebar model and balance

Shows the model used by the current session and the balance of the provider that session uses in a compact card above the Settings and account controls at the sidebar foot. For DeepSeek account sessions that balance is the DSH account balance; for Kimi (Moonshot) sessions it is the Moonshot account balance.

## Install

1. Clone or download this repository.
2. In DeepSeek Harness, open **Settings → Plugins → Add plugin** and select this folder (the one containing `package.json`).
3. Refresh the page if the card does not appear.

The plugin is a local bundle and is linked into the active DSH profile. It has no runtime npm dependencies; the client packages resolve from the DSH installation.

## Usage

1. Expand the left sidebar.
2. Look above the Settings/account controls. The card shows the current model name with its provider, and the balance of the provider the session uses.
3. Collapse the sidebar and the card hides; expand it again to bring the card back.

## Behavior and limitations

- The model comes from the session's shared model catalog and updates when you switch models from the composer or `/model`. A removed model falls back to the localized unavailable state instead of an opaque model id.
- The balance normally reads the account snapshot already loaded by DeepSeek Harness. Before the active session has any conversation, this plugin does not request a balance. It still shows whatever balance DSH's account plugin has already loaded.
- Once the active session has a conversation, the card requests a fresh balance from the same account endpoint DSH uses every 60 seconds. After each turn ends it requests one more balance 3 seconds later.
- Requests are skipped while the page is hidden; one queued request runs when the page becomes visible. Switching to a blank session or leaving the session stops the 60-second timer.
- DSH's account plugin may still read the balance on its own, for example during sign-in or when opening Settings; this plugin does not control those reads. When the account owner refreshes its own balance, that newer read wins over the card's read.
- The amount is the topped-up wallet plus any granted bonus for the primary currency (CNY first). When a bonus is included the caption reads "Balance incl. bonus". Other currencies are not combined.
- When no account is connected the card reads "Signed out"; while account data is loading it shows a loading state; after a stream failure it reads "Unavailable".
- Balance display is a convenience view, not a billing statement. The authoritative amount remains on the DeepSeek platform. Open Settings → Account to retry, sign in, or top up.
- The card is hidden in the collapsed icon rail so it does not crowd the existing rail controls.
- The card occupies its own row in the sidebar footer action list. If a future DSH release changes that seat's layout, the card may not appear; it is sized to give up its own width rather than overflow the sidebar.
- If this client never receives account access, the account data can stay unavailable and the card may remain in its loading state instead of showing a signed-out result.
- When the session uses a Kimi (Moonshot) provider — `moonshot`, `moonshot-cn`, `moonshotai`, `moonshotai-cn` — the card shows that provider's wallet balance instead of the DSH account balance. The card reads `available_balance` and `voucher_balance` from `GET <baseURL>/users/me/balance` and shows topped-up plus voucher balance; the caption reads "Balance incl. bonus" when a voucher balance is present.
- That request runs in the plugin's Host half: the client asks `GET /dsh-provider-balance?provider=<id>` on the same origin, and the Host resolves the stored API key (`MOONSHOT_API_KEY` for the Moonshot providers, read through DSH credentials) and calls the provider. The key never reaches the renderer. The route only accepts GET and HEAD, answers `no-credential`, `failed` or `unknown-provider` instead of leaking an error body, and allows absent origins (the desktop shell strips them), `dsh-app://app` and loopback origins only.
- Provider balances are cached for 30 seconds in the Host and 20 seconds in the client, and follow the same refresh points as the account balance.
- If the provider has no stored key the card reads "No API key"; if the request fails it reads "Unavailable". A session whose provider is none of the four Moonshot ids keeps the DeepSeek account behaviour above.
- Turning the plugin off removes the card and leaves the rest of the sidebar unchanged.
