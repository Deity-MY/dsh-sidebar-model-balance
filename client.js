window.__ModuleLoader__.load({
  id: '@local/sidebar-model-balance',
  factory(require) {
    const React = require('react');

    const h = React.createElement;
    const NS = 'sidebar-model-balance';
    const CONVERSATION_REFRESH_INTERVAL_MS = 60000;
    const TURN_END_REFRESH_DELAY_MS = 3000;

    /*
     * Balances the Host half reads for providers other than the DeepSeek
     * account. The browser cannot call those endpoints directly, so the card
     * asks the Host route that owns the API key.
     */
    const PROVIDER_BALANCE_URL = '/dsh-provider-balance';
    const PROVIDER_CACHE_MS = 20000;
    const isHostBalanceProvider = provider => typeof provider === 'string'
      && provider.startsWith('moonshot');

    const EN = {
      model: 'Model',
      balance: 'Balance',
      balanceWithBonus: 'Balance incl. bonus',
      loading: 'Loading',
      unavailable: 'Unavailable',
      signedOut: 'Signed out',
      noSession: 'No session',
      providerAccount: 'DeepSeek Account',
      noKey: 'No API key',
      label: 'Current model and balance',
      summary: 'Model {model}, balance {balance}',
    };
    const ZH = {
      model: '模型',
      balance: '余额',
      balanceWithBonus: '余额（含赠送）',
      loading: '加载中',
      unavailable: '不可用',
      signedOut: '未登录',
      noSession: '无会话',
      providerAccount: 'DeepSeek 账号',
      noKey: '未配置密钥',
      label: '当前模型与余额',
      summary: '当前模型 {model}，余额 {balance}',
    };

    const CSS = `
      /*
       * The sidebar footer action seat is a flex row. This rule lets the card
       * take its own row above the existing footer actions. If a future DSH
       * release changes that seat's wrapper, the card gives up its width
       * instead of overflowing the sidebar.
       */
      div:has(> [data-slot="sidebar.footer.action"]) {
        flex-wrap: wrap;
      }
      .dsh-mbc-card {
        order: -1;
        flex: 1 1 100%;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        height: 44px;
        margin: 8px 0 0;
        padding: 0 10px 0 8px;
        border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l1));
        border-radius: 12px;
        background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2));
        color: var(--dsw-alias-label-primary);
        font-family: inherit;
        font-size: 14px;
        line-height: 18px;
        overflow: hidden;
      }
      [data-platform='darwin'] .dsh-mbc-card {
        background: var(--dsw-specific-sidebar-glass-fill, var(--dsw-alias-settings-card-fill));
      }
      .dsh-mbc-icon {
        flex: none;
        display: inline-flex;
        color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
      }
      .dsh-mbc-copy {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .dsh-mbc-model {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }
      .dsh-mbc-caption {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 14px;
      }
      .dsh-mbc-balance {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 1px;
        min-width: 0;
        max-width: 46%;
      }
      .dsh-mbc-amount {
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
      }
    `;

    const SPARKLE = h(
      'svg',
      {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', {
        d: 'M8 1.5L9.7 6.3L14.5 8L9.7 9.7L8 14.5L6.3 9.7L1.5 8L6.3 6.3L8 1.5Z',
        fill: 'currentColor',
      }),
    );

    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe: listener => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set: next => {
          if (Object.is(next, value)) return;
          value = next;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    function formatBalance(amount, symbol) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return `${symbol}${amount}`;
      if (value === 0) return `${symbol}0.00`;
      const absolute = Math.abs(value);
      if (absolute < 0.01) return value < 0 ? `-${symbol}0.01` : `<${symbol}0.01`;
      const cents = Math.floor(absolute * 100 + 1e-9) / 100;
      const text = cents.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${value < 0 ? '-' : ''}${symbol}${text}`;
    }

    function ModelBalanceCard({
      wide, useSessions, directoryFor, sessionFor, accountStore, providerBalanceStore,
      setConversationActive, requestBalance, requestProviderBalance, t,
    }) {
      const sessionId = useSessions(state => {
        for (const id of state.ids) {
          const row = state.byId[id];
          if (row !== undefined && (row.retainedBy.mainView ?? 0) > 0) return id;
        }
        return undefined;
      });
      const listPhase = useSessions(state => state.phase);

      const directory = React.useMemo(() => {
        if (sessionId === undefined) return undefined;
        return directoryFor(sessionId);
      }, [sessionId, directoryFor]);
      const session = React.useMemo(() => {
        if (sessionId === undefined) return undefined;
        return sessionFor(sessionId);
      }, [sessionId, sessionFor]);

      const subscribe = React.useCallback(listener => {
        return directory === undefined ? () => {} : directory.store.subscribe(listener);
      }, [directory]);
      const getSnapshot = React.useCallback(() => {
        return directory === undefined ? undefined : directory.store.getSnapshot();
      }, [directory]);
      const subscribeSession = React.useCallback(listener => {
        return session === undefined ? () => {} : session.subscribe(listener);
      }, [session]);
      const getSessionSnapshot = React.useCallback(() => {
        return session === undefined ? undefined : session.getSnapshot();
      }, [session]);

      const model = React.useSyncExternalStore(subscribe, getSnapshot);
      const lifecycle = React.useSyncExternalStore(subscribeSession, getSessionSnapshot);
      const account = React.useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
      const providerBalance = React.useSyncExternalStore(
        providerBalanceStore.subscribe,
        providerBalanceStore.getSnapshot,
      );

      // The provider the session uses now decides which balance the card
      // shows: the DeepSeek account one, or the Host-served provider one.
      const providerId = model?.pending?.provider ?? model?.current?.provider;
      const providerMode = isHostBalanceProvider(providerId);
      const providerIdRef = React.useRef(providerId);
      providerIdRef.current = providerId;
      React.useEffect(() => {
        if (providerMode) requestProviderBalance(providerId);
      }, [providerMode, providerId, requestProviderBalance]);

      React.useEffect(() => {
        setConversationActive(sessionId !== undefined && lifecycle?.blank === false);
      }, [sessionId, lifecycle?.blank, setConversationActive]);

      const previousRunning = React.useRef({ sessionId: undefined, running: undefined });
      React.useEffect(() => {
        const previous = previousRunning.current;
        previousRunning.current = { sessionId, running: lifecycle?.running };
        if (sessionId === undefined) return;
        if (previous.sessionId !== sessionId
          || previous.running !== true
          || lifecycle?.running !== false) return;
        const timer = window.setTimeout(() => {
          requestBalance();
          requestProviderBalance(providerIdRef.current, true);
        }, TURN_END_REFRESH_DELAY_MS);
        return () => {
          window.clearTimeout(timer);
        };
      }, [lifecycle?.running, sessionId, requestBalance, requestProviderBalance]);

      if (!wide) return null;

      const selection = model?.pending ?? model?.current ?? null;
      const group = selection === null
        ? undefined
        : model?.groups.find(candidate => candidate.id === selection.provider);
      const entry = selection === null
        ? undefined
        : group?.models.find(candidate => candidate.id === selection.model);
      const modelLoading = listPhase !== 'ready'
        || (model !== undefined
          && (model.status === 'idle' || model.status === 'loading' || model.status === 'selecting'));
      const modelError = model?.status === 'error';
      let modelName;
      let modelCaption;
      if (selection !== null) {
        modelName = entry?.name ?? (modelError || !modelLoading ? t('unavailable') : '…');
        modelCaption = selection.provider === 'deepseek-account'
          ? t('providerAccount')
          : group?.name ?? (modelLoading ? t('loading') : t('model'));
      } else if (sessionId === undefined && listPhase === 'ready') {
        modelName = t('noSession');
        modelCaption = t('model');
      } else if (modelLoading) {
        modelName = '…';
        modelCaption = t('loading');
      } else {
        modelName = t('unavailable');
        modelCaption = t('model');
      }

      const view = account?.view;
      const signedIn = view?.status === 'credential-stored';
      const balance = account?.details?.balance;
      let amount = '—';
      let balanceCaption = t('balance');
      if (providerMode) {
        const snapshot = providerBalance;
        const value = snapshot.provider === providerId ? snapshot.value : undefined;
        if (value === undefined) {
          if (snapshot.status === 'error') {
            balanceCaption = t('unavailable');
          } else {
            amount = '…';
            balanceCaption = t('loading');
          }
        } else if (value.status === 'ready') {
          amount = formatBalance(String(value.available), value.currency === 'CNY' ? '¥' : '$');
          balanceCaption = Number(value.voucher) > 0 ? t('balanceWithBonus') : t('balance');
        } else if (value.status === 'no-credential') {
          balanceCaption = t('noKey');
        } else {
          balanceCaption = t('unavailable');
        }
      } else if (account?.failed === true) {
        balanceCaption = t('unavailable');
      } else if (view === undefined) {
        amount = '…';
        balanceCaption = t('loading');
      } else if (!signedIn) {
        balanceCaption = t('signedOut');
      } else if (balance === undefined) {
        amount = '…';
        balanceCaption = t('loading');
      } else if (balance.status === 'failed') {
        balanceCaption = t('unavailable');
      } else {
        const wallets = balance.value ?? [];
        const bonusWallets = balance.bonusWallets ?? [];
        const currency = wallets.find(wallet => wallet.currency === 'CNY')?.currency
          ?? wallets[0]?.currency
          ?? bonusWallets.find(wallet => wallet.currency === 'CNY')?.currency
          ?? bonusWallets[0]?.currency;
        const main = currency === undefined ? undefined : wallets.find(wallet => wallet.currency === currency);
        const bonus = currency === undefined ? undefined : bonusWallets.find(wallet => wallet.currency === currency);
        const total = Number(main?.balance ?? 0) + Number(bonus?.balance ?? 0);
        if (currency === undefined || !Number.isFinite(total)) {
          balanceCaption = t('unavailable');
        } else {
          amount = formatBalance(String(total), currency === 'CNY' ? '¥' : '$');
          balanceCaption = Number(bonus?.balance ?? 0) > 0 ? t('balanceWithBonus') : t('balance');
        }
      }

      const summary = t('summary', { model: modelName, balance: amount });

      return h(
        React.Fragment,
        null,
        h('style', { key: 'model-balance-styles' }, CSS),
        h(
          'div',
          {
            key: 'model-balance-card',
            className: 'dsh-mbc-card',
            'data-dsh-model-balance': '',
            role: 'group',
            'aria-label': t('label'),
            title: summary,
          },
          h('span', { className: 'dsh-mbc-icon' }, SPARKLE),
          h(
            'div',
            { className: 'dsh-mbc-copy' },
            h('span', { className: 'dsh-mbc-model' }, modelName),
            h('span', { className: 'dsh-mbc-caption' }, modelCaption),
          ),
          h(
            'div',
            { className: 'dsh-mbc-balance' },
            h('span', { className: 'dsh-mbc-amount' }, amount),
            h('span', { className: 'dsh-mbc-caption' }, balanceCaption),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'accountUi', 'modelDirectories', 'sessions', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: EN, zh: ZH }),
          'model-balance: dictionaries',
        );
        const t = ctx.locale.bind(NS);

        // The host publishes its full AccountSnapshot through this service; its
        // declared client face only names `view`/`failed`, so read `details`
        // defensively and keep the card recoverable if the host omits it.
        const accountStore = createStore(ctx.accountUi.getSnapshot());
        // A balance read started by the conversation timer stays in front of
        // the older account snapshot until the account owner refreshes.
        let fetchedBalance;
        let accountGeneration = 0;
        const syncAccount = () => {
          const next = ctx.accountUi.getSnapshot();
          accountStore.set(fetchedBalance !== undefined && next.view?.status === 'credential-stored'
            ? { ...next, details: { ...next.details, balance: fetchedBalance } }
            : next);
        };
        let balanceRequest;
        let pendingBalanceRefresh = false;
        const requestBalance = () => {
          if (document.visibilityState !== 'visible') {
            pendingBalanceRefresh = true;
            return;
          }
          if (ctx.accountUi.getSnapshot().view?.status !== 'credential-stored') {
            pendingBalanceRefresh = false;
            return;
          }
          if (balanceRequest !== undefined) {
            pendingBalanceRefresh = true;
            return;
          }
          const generation = accountGeneration;
          let request;
          try {
            request = ctx.remote.account.getBalance(
              ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active),
            );
          } catch {
            return;
          }
          balanceRequest = request.then(result => {
            if (generation !== accountGeneration) return;
            if (!result.ok || result.value?.status !== 'ready') return;
            fetchedBalance = result.value;
            syncAccount();
          }).catch(() => {
            /* A failed read leaves the last known balance on screen. */
          }).finally(() => {
            balanceRequest = undefined;
            if (pendingBalanceRefresh && document.visibilityState === 'visible') {
              pendingBalanceRefresh = false;
              requestBalance();
            }
          });
        };

        // Host-served provider balances. The Client never holds the API key: it
        // asks this bundle's Host route, which resolves the stored key and calls
        // the provider. A failed read keeps the last value on screen.
        const providerStore = createStore({ provider: undefined, status: 'idle', value: undefined });
        let providerRequest;
        let providerFetchedAt = 0;
        let providerFetchedId;
        let activeProvider;
        const requestProviderBalance = (providerId, force = false) => {
          if (!isHostBalanceProvider(providerId)) return;
          activeProvider = providerId;
          if (providerRequest !== undefined) return;
          const state = providerStore.getSnapshot();
          if (!force
            && providerFetchedId === providerId
            && state.status === 'ready'
            && Date.now() - providerFetchedAt < PROVIDER_CACHE_MS) return;
          providerStore.set({
            provider: providerId,
            status: 'loading',
            value: state.provider === providerId ? state.value : undefined,
          });
          providerRequest = fetch(
            `${PROVIDER_BALANCE_URL}?provider=${encodeURIComponent(providerId)}`,
            { headers: { accept: 'application/json' }, cache: 'no-store' },
          ).then(response => {
            if (!response.ok) throw new Error(`provider balance HTTP ${response.status}`);
            return response.json();
          }).then(value => {
            providerFetchedId = providerId;
            providerFetchedAt = Date.now();
            providerStore.set({
              provider: providerId,
              status: value?.status === 'ready' ? 'ready' : 'error',
              value,
            });
          }).catch(() => {
            providerStore.set({ provider: providerId, status: 'error', value: undefined });
          }).finally(() => {
            providerRequest = undefined;
          });
        };

        let conversationTimer;
        const stopConversationPoll = () => {
          if (conversationTimer === undefined) return;
          window.clearInterval(conversationTimer);
          conversationTimer = undefined;
        };
        const setConversationActive = active => {
          if (active !== true) {
            stopConversationPoll();
            pendingBalanceRefresh = false;
            return;
          }
          if (conversationTimer !== undefined) return;
          conversationTimer = window.setInterval(() => {
            requestBalance();
            requestProviderBalance(activeProvider);
          }, CONVERSATION_REFRESH_INTERVAL_MS);
        };

        const timers = new Set();
        const later = delay => {
          const timer = window.setTimeout(() => {
            timers.delete(timer);
            syncAccount();
          }, delay);
          timers.add(timer);
        };

        let pollTimer;
        let pollAttempts = 0;
        const needsBalancePoll = () => {
          const state = accountStore.getSnapshot();
          return state.view?.status === 'credential-stored'
            && state.details?.balance === undefined
            && state.failed !== true;
        };
        const stopPoll = () => {
          if (pollTimer === undefined) return;
          window.clearInterval(pollTimer);
          pollTimer = undefined;
        };
        const startPoll = () => {
          if (pollTimer !== undefined || !needsBalancePoll()) return;
          pollAttempts = 0;
          pollTimer = window.setInterval(() => {
            syncAccount();
            pollAttempts += 1;
            const state = accountStore.getSnapshot();
            if (state.failed === true
              || state.view?.status !== 'credential-stored'
              || state.details?.balance !== undefined
              || pollAttempts >= 35) {
              stopPoll();
            }
          }, 1000);
        };
        // A newer account change or explicit refresh gets a fresh read budget.
        const restartPoll = () => {
          stopPoll();
          startPoll();
        };

        ctx.effect(() => {
          const offChange = ctx.on('account-ui/change', (_state, reset) => {
            if (reset === true) {
              accountGeneration += 1;
              fetchedBalance = undefined;
            }
            syncAccount();
            later(800);
            later(3000);
            later(10000);
            restartPoll();
          });
          const offRefresh = ctx.on('account-ui/refresh', () => {
            // The account owner is reading a newer balance; stop preferring
            // this plugin's balance read.
            accountGeneration += 1;
            fetchedBalance = undefined;
            later(800);
            later(3000);
            later(10000);
            later(30000);
            restartPoll();
          });
          const onVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            syncAccount();
            restartPoll();
            if (pendingBalanceRefresh) {
              pendingBalanceRefresh = false;
              requestBalance();
            }
            requestProviderBalance(activeProvider);
          };
          document.addEventListener('visibilitychange', onVisibility);
          later(800);
          later(3000);
          later(10000);
          startPoll();
          return () => {
            offChange?.();
            offRefresh?.();
            document.removeEventListener('visibilitychange', onVisibility);
            stopConversationPoll();
            stopPoll();
            for (const timer of timers) window.clearTimeout(timer);
            timers.clear();
          };
        }, 'model-balance: account snapshot sync');

        const directoryFor = sessionId => {
          try {
            return ctx.modelDirectories.directoryFor(sessionId);
          } catch {
            return undefined;
          }
        };
        const sessionFor = sessionId => {
          try {
            return ctx.sessions.binding(sessionId)?.session;
          } catch {
            return undefined;
          }
        };

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'model-balance',
          order: -10,
          locale: NS,
          label: () => t('label'),
          inject: () => ({
            accountStore,
            providerBalanceStore: providerStore,
            directoryFor,
            sessionFor,
            setConversationActive,
            requestBalance,
            requestProviderBalance,
          }),
        }, ModelBalanceCard));
      },
    };
  },
});
