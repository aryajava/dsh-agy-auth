/** Browser half: the Antigravity accounts page and its sidebar entry. */
import type { ClientContext } from './contract.ts'
import { ActivityCards } from './ActivityCards.tsx'
import { AgyAuthIcon } from './icon.tsx'
import { I18nProvider } from './i18n.tsx'
import { AgyAuthPage } from './page.tsx'
import { createAgyAuthStore } from './store.ts'
import { installStyles } from './styles.ts'

/** Panel key shared by the sidebar entry and the main slot registration. */
const PANEL_ID = 'agy-auth'

/** The slot registry is the only required client service. */
export const inject = ['slots']

/**
 * Register the stylesheet, the store, the page, and the sidebar entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const store = createAgyAuthStore()
  ctx.effect(() => () => { store.dispose() }, 'agy-auth: store')
  ctx.effect(() => installStyles(), 'agy-auth: styles')

  const injectFace = (): Record<string, unknown> => ({
    hooks: { agy: store.source },
    actions: store.actions,
  })

  function Page(props: Parameters<typeof AgyAuthPage>[0]) {
    return (
      <I18nProvider>
        <AgyAuthPage {...props} />
      </I18nProvider>
    )
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    inject: injectFace,
  }, Page))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: 'Antigravity' },
    AgyAuthIcon,
  ))

  function ActivityCardsShell(props: Parameters<typeof ActivityCards>[0]) {
    return (
      <I18nProvider>
        <ActivityCards {...props} />
      </I18nProvider>
    )
  }

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'agy-auth-activity',
    order: 40,
    inject: (sessionId: string) => ({ sessionId }),
  }, ActivityCardsShell))
}