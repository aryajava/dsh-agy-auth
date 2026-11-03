/** The slice of the Cordis client context this plugin uses. */
export interface ClientContext {
  effect(disposer: () => void | (() => void), label?: string): void
  slots: SlotsService
}

/** The slice of the slot registry this plugin uses. */
export interface SlotsService {
  /** Wait for a slot declaration, then install registrations for its lifetime. */
  inject(name: string, register: () => (() => void) | void): void
  /** Contribute one component to a declared slot. */
  register(options: SlotOptions, component: React.ComponentType<any>): () => void
}

/** Registration options shared by the slots this plugin contributes to. */
export interface SlotOptions {
  name: string
  id?: string
  key?: string
  order?: number
  label?: string
  /** Registrant-private data and callbacks, including the `hooks` compartment. */
  inject?: (sessionId: string) => Record<string, unknown>
}