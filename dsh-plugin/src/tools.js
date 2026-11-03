/**
 * Model-facing tools over the account service.
 *
 * Every tool returns a canonical JSON object and a readable text projection.
 * The tool layer validates model input and turns CLI failures into structured
 * results instead of throwing, so the model can act on the hint.
 *
 * @module @fikrilal/dsh-agy-auth/tools
 */
import { InputError, requireTarget, requireText } from './service.js'

/**
 * Convert any thrown value into a result error.
 * @param {unknown} error - thrown value.
 * @returns {{ code: string, message: string, hint?: string }} error document.
 */
function toError(error) {
  if (error instanceof InputError) return { code: error.code, message: error.message }
  return { code: 'internal_error', message: error instanceof Error ? error.message : String(error) }
}

/**
 * Normalize one CLI account row for the model.
 * @param {Record<string, any>} row - accountRow from the CLI.
 * @returns {Record<string, unknown>} condensed account.
 */
export function accountView(row) {
  return {
    id: row.id ?? null,
    alias: row.alias ?? null,
    email: row.email ?? null,
    plan: row.plan ?? null,
    active: row.active === true,
    stored: row.stored !== false,
    auth_method: row.auth_method ?? null,
    expires_at: row.expires_at ?? null,
    expired: row.expired === true,
    added_at: row.added_at ?? null,
    last_used_at: row.last_used_at ?? null,
    five_hour: row.usage?.five_hour ?? null,
    weekly: row.usage?.weekly ?? null,
    usage_error: row.usage_error ?? null,
  }
}

/**
 * Render one quota window.
 * @param {{ remaining_percent?: number, resets_at?: string } | null | undefined} window - quota window.
 * @returns {string} short text.
 */
function quotaText(window) {
  if (window === null || window === undefined) return 'unknown'
  const percent = typeof window.remaining_percent === 'number' ? `${window.remaining_percent}%` : '?'
  return typeof window.resets_at === 'string' ? `${percent} (resets ${window.resets_at})` : percent
}

/**
 * Render the account list as text.
 * @param {Record<string, any>} payload - list result.
 * @returns {string} model-facing text.
 */
export function renderList(payload) {
  if (payload.ok !== true) return renderError('list', payload)
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : []
  if (accounts.length === 0) {
    return 'No stored Antigravity accounts. Sign in with "agy-auth login" or save the current agy account with "agy-auth add".'
  }
  const active = accounts.find(account => account.active === true)
  const lines = [
    `Stored Antigravity accounts: ${accounts.length}`,
    active === undefined
      ? 'Active: none'
      : `Active: ${active.alias ?? active.email ?? active.id}${active.plan === null ? '' : ` (${active.plan})`}`,
    '',
  ]
  accounts.forEach((account, index) => {
    const name = accountName(account)
    const details = [
      account.email ?? null,
      account.plan ?? null,
      `5h ${quotaText(account.five_hour)}`,
      `week ${quotaText(account.weekly)}`,
      account.expired === true ? 'token expired' : null,
      account.stored === false ? 'not stored' : null,
    ].filter(value => value !== null)
    lines.push(`${index + 1}. ${account.active === true ? '*' : '-'} ${name} [${account.id}] — ${details.join(' · ')}`)
  })
  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    lines.push('', 'Warnings:', ...payload.warnings.map(warning => `- ${warning}`))
  }
  return lines.join('\n')
}

/**
 * Render an error result.
 * @param {string} command - command label.
 * @param {Record<string, any>} payload - failed result.
 * @returns {string} text.
 */
export function renderError(command, payload) {
  const error = payload.error ?? { code: 'error', message: 'unknown failure' }
  const lines = [`agy-auth ${command} failed (${error.code}): ${error.message}`]
  if (typeof error.hint === 'string' && error.hint !== '') lines.push(`Hint: ${error.hint}`)
  if (Array.isArray(error.candidates) && error.candidates.length > 0) {
    lines.push('Candidates:')
    for (const candidate of error.candidates) {
      lines.push(`- ${candidate.alias ?? candidate.email ?? candidate.id} [${candidate.id}]`)
    }
  }
  return lines.join('\n')
}

/**
 * Render one account name.
 * @param {Record<string, any> | null | undefined} account - account record.
 * @returns {string} display name.
 */
function accountName(account) {
  if (account === null || account === undefined) return 'the account'
  if (typeof account.alias === 'string' && account.alias !== '') return account.alias
  if (typeof account.email === 'string' && account.email !== '') return account.email
  return account.id ?? 'the account'
}

/**
 * Render a mutation result for one command family.
 * @param {'switch' | 'add' | 'alias' | 'remove' | 'rotate'} kind - command family.
 * @param {Record<string, any>} payload - result.
 * @returns {string} text.
 */
function renderMutation(kind, payload) {
  if (payload.ok !== true) return renderError(kind, payload)
  const data = payload.data ?? {}
  const lines = []
  if (kind === 'switch') {
    lines.push(`Switched to ${accountName(data.account)}${typeof data.target === 'string' ? ` (target: ${data.target})` : ''}.`)
  } else if (kind === 'add') {
    lines.push(`${data.created === true ? 'Added' : 'Updated'} account ${accountName(data.account)}.`)
  } else if (kind === 'alias') {
    const label = data.email ?? data.id ?? accountName(data)
    lines.push(typeof data.alias === 'string' && data.alias !== ''
      ? `Alias for ${label} set to "${data.alias}".`
      : `Cleared the alias for ${label}.`)
  } else if (kind === 'remove') {
    const removed = Array.isArray(data.removed) ? data.removed : []
    lines.push(`Removed ${removed.length} account(s)${data.logged_out === true ? ' and the live credential' : ''}.`)
  } else if (kind === 'rotate') {
    if (data.rotated === true) lines.push(`Rotated to ${accountName(data.account)}${typeof data.reason === 'string' ? ` (${data.reason})` : ''}.`)
    else lines.push(`No rotation: ${typeof data.reason === 'string' ? data.reason : 'not needed'}.`)
  }
  if ((kind === 'switch' || kind === 'rotate') && data.cli_switched === true) {
    lines.push('Restart agy for the new credential to take effect; running sessions keep the old one.')
  }
  if ((kind === 'switch' || kind === 'rotate') && data.desktop_switched === true) {
    lines.push('The Antigravity Desktop profile was restored.')
  }
  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    lines.push('Warnings:', ...payload.warnings.map(warning => `- ${warning}`))
  }
  return lines.join('\n')
}

/**
 * Build one raw ToolDefinition.
 * @param {object} spec - name, description, parameters, execute, render.
 * @returns {Record<string, unknown>} registry-ready tool.
 */
function tool(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        return [{ type: 'text', text: spec.render(value) }]
      },
    },
    async execute(args, exec) {
      try {
        return await spec.execute(args ?? {}, exec)
      } catch (error) {
        return { ok: false, error: toError(error) }
      }
    },
  }
}

/**
 * Create the model-facing tools bound to one service.
 * @param {import('./service.js').AgyAuthService} service - account service.
 * @returns {Record<string, unknown>[]} tool definitions.
 */
export function createTools(service) {
  return [
    tool({
      name: 'agy_auth_list',
      description: 'List stored Google Antigravity accounts with the active account, plan, and 5-hour/weekly quota remaining. Use refresh=true to bypass the cache and re-query quota.',
      parameters: {
        type: 'object',
        properties: {
          refresh: { type: 'boolean', description: 'Force a fresh read instead of using the cached snapshot.' },
        },
        additionalProperties: false,
      },
      async execute(args, exec) {
        const state = await service.state({ force: args.refresh === true, signal: exec?.signal })
        const accounts = (state.accounts ?? []).map(accountView)
        return {
          ok: state.ok,
          available: state.available,
          active: accounts.find(account => account.active) ?? state.current ?? null,
          accounts,
          warnings: state.warnings ?? [],
          error: state.error ?? null,
          fetched_at: state.fetchedAt,
        }
      },
      render: renderList,
    }),
    tool({
      name: 'agy_auth_status',
      description: 'Show agy-auth storage health: registry paths, keyring availability, credential mirror state, running agy/Desktop processes, and the current live account.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute(_args, exec) {
        const view = await service.statusView({ force: true, signal: exec?.signal })
        const model = typeof service.modelStatus === 'function' ? await service.modelStatus() : null
        return {
          ok: view.ok,
          available: view.available,
          binary: view.binary,
          version: view.version,
          current: view.current,
          storage: view.status,
          paths: view.paths,
          model,
          warnings: view.warnings ?? [],
          error: view.error ?? null,
        }
      },
      render(payload) {
        if (payload.ok !== true) return renderError('status', payload)
        const storage = payload.storage ?? {}
        const lines = [
          `agy-auth ${payload.version ?? 'unknown version'} (${payload.binary?.resolved ?? 'not resolved'})`,
          `Registry: ${storage.registry ?? 'unknown'}`,
          `Token file: ${storage.token_file ?? 'unknown'}`,
          `Keyring: ${storage.keyring_service ?? '?'} / ${storage.keyring_user ?? '?'} (${storage.keyring_available === true ? 'available' : 'unavailable'})`,
          `Mirror: ${storage.mirror ?? 'unknown'}`,
          `Stored accounts: ${storage.stored_accounts ?? '?'}`,
          `Current: ${payload.current?.email || storage.current?.email || 'not signed in'}`,
        ]
        if (payload.model !== null && payload.model !== undefined) {
          lines.push(`Model provider: ${payload.model.enabled ? 'enabled' : 'disabled'} · ${payload.model.provider ?? 'antigravity'} · ${payload.model.available ? 'available' : 'unavailable'} · permission ${payload.model.permissionMode ?? 'unknown'}`)
          if (Array.isArray(payload.model.models) && payload.model.models.length > 0) lines.push('Models: ' + payload.model.models.map(model => model.id).join(', '))
          if (typeof payload.model.error === 'string') lines.push('Model error: ' + payload.model.error)
        }
        return lines.join('\n')
      },
    }),
    tool({
      name: 'agy_auth_switch',
      description: 'Switch the live Antigravity credential to another stored account. The account argument accepts an account id, alias, email, or list row number. Switching affects agy and, by default, Antigravity Desktop.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Account id, alias, email, or row number.' },
          target: { type: 'string', enum: ['all', 'cli', 'desktop'], description: 'Which credential target to switch. Defaults to all.' },
          relaunch: { type: 'boolean', description: 'Restart Antigravity Desktop after switching its profile.' },
        },
        required: ['account'],
        additionalProperties: false,
      },
      async execute(args, exec) {
        const result = await service.switch(requireText(args.account, 'account'), {
          target: requireTarget(args.target),
          relaunch: args.relaunch === true,
          signal: exec?.signal,
        })
        return result
      },
      render: payload => renderMutation('switch', payload),
    }),
    tool({
      name: 'agy_auth_add',
      description: 'Save the account that is currently signed in to agy as a stored account, optionally with an alias.',
      parameters: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'Optional short alias (no whitespace, max 32 characters).' },
          target: { type: 'string', enum: ['all', 'cli', 'desktop'], description: 'Which credential target to capture. Defaults to all.' },
        },
        additionalProperties: false,
      },
      async execute(args, exec) {
        const result = await service.add({ alias: args.alias, target: requireTarget(args.target), signal: exec?.signal })
        return result
      },
      render: payload => renderMutation('add', payload),
    }),
    tool({
      name: 'agy_auth_alias',
      description: 'Set or clear a stored account alias. Pass an empty alias to clear it.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Account id, alias, email, or row number.' },
          alias: { type: 'string', description: 'New alias, or an empty string to clear.' },
        },
        required: ['account', 'alias'],
        additionalProperties: false,
      },
      async execute(args, exec) {
        const result = await service.setAlias(requireText(args.account, 'account'), typeof args.alias === 'string' ? args.alias : '', { signal: exec?.signal })
        return result
      },
      render: payload => renderMutation('alias', payload),
    }),
    tool({
      name: 'agy_auth_remove',
      description: 'Remove one stored account snapshot. Destructive: requires confirm=true. The live credential is kept unless logout=true.',
      parameters: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Account id, alias, email, or row number.' },
          confirm: { type: 'boolean', description: 'Must be true to remove the account.' },
          logout: { type: 'boolean', description: 'Also delete the live agy credential when removing the active account.' },
        },
        required: ['account', 'confirm'],
        additionalProperties: false,
      },
      async execute(args, exec) {
        if (args.confirm !== true) {
          return { ok: false, error: { code: 'confirmation_required', message: 'pass confirm=true to remove an account' } }
        }
        const result = await service.remove(requireText(args.account, 'account'), { logout: args.logout === true, signal: exec?.signal })
        return result
      },
      render: payload => renderMutation('remove', payload),
    }),
    tool({
      name: 'agy_auth_rotate',
      description: 'Rotate to the stored account with the most remaining 5-hour quota when the active account is exhausted. Use force=true to switch anyway.',
      parameters: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: 'Rotate even when the active account is healthy.' },
          target: { type: 'string', enum: ['all', 'cli', 'desktop'], description: 'Which credential target to switch. Defaults to all.' },
          relaunch: { type: 'boolean', description: 'Restart Antigravity Desktop after switching its profile.' },
        },
        additionalProperties: false,
      },
      async execute(args, exec) {
        const result = await service.rotate({
          force: args.force === true,
          target: requireTarget(args.target),
          relaunch: args.relaunch === true,
          signal: exec?.signal,
        })
        return result
      },
      render: payload => renderMutation('rotate', payload),
    }),
    tool({
      name: 'agy_auth_usage',
      description: 'Compare quota groups (Gemini Models, Claude and GPT models, tier groups) across every stored account.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute(_args, exec) {
        return service.usageAll({ signal: exec?.signal })
      },
      render(payload) {
        if (payload.ok !== true) return renderError('usage', payload)
        const accounts = Array.isArray(payload.data?.accounts) ? payload.data.accounts : []
        if (accounts.length === 0) return 'No accounts with quota data.'
        const lines = []
        for (const account of accounts) {
          const label = account.alias ?? account.email ?? account.id
          lines.push(`${account.active === true ? '* ' : ''}${label} [${account.id}]`)
          if (typeof account.usage_error === 'string') {
            lines.push(`  usage unavailable: ${account.usage_error}`)
            continue
          }
          for (const group of Array.isArray(account.groups) ? account.groups : []) {
            const windows = (Array.isArray(group.buckets) ? group.buckets : [])
              .map(bucket => `${bucket.window} ${bucket.remaining_percent}%${typeof bucket.reset_time === 'string' ? ` (resets ${bucket.reset_time})` : ''}`)
              .join(' · ')
            lines.push(`  ${group.name}: ${windows || 'no windows'}`)
          }
          lines.push('')
        }
        return lines.join('\n').trim()
      },
    }),
  ]
}