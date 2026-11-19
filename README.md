# Sidebar model and balance

Shows the model used by the current session and your DeepSeek account balance in a compact card above the Settings and account controls at the sidebar foot.

## Install

1. Clone or download this repository.
2. In DeepSeek Harness, open **Settings → Plugins → Add plugin** and select this folder (the one containing `package.json`).
3. Refresh the page if the card does not appear.

The plugin is a local bundle and is linked into the active DSH profile. It has no runtime npm dependencies; the client packages resolve from the DSH installation.

## Usage

1. Expand the left sidebar.
2. Look above the Settings/account controls. The card shows the current model name with its provider, and the available DeepSeek account balance.
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
- Turning the plugin off removes the card and leaves the rest of the sidebar unchanged.
