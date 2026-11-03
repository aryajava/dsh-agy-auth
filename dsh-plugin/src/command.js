/**
 * Process boundary for the `agy-auth` CLI.
 *
 * The plugin never passes arguments through a shell: an npm-installed
 * `agy-auth` is usually a `.cmd` shim on Windows, which cannot be spawned
 * directly, so the shim is unwrapped to the Node launcher it points at. When
 * that fails the launch reports an actionable setup error instead of guessing.
 *
 * @module @fikrilal/dsh-agy-auth/command
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path'

const WINDOWS = process.platform === 'win32'
const SHIM_EXTENSIONS = ['.cmd', '.bat']
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024

/** Failure to locate or launch the CLI, carrying a user-facing setup code. */
export class LaunchError extends Error {
  /**
   * @param {string} code - stable machine code.
   * @param {string} message - user-facing message.
   * @param {string} [hint] - remediation.
   */
  constructor(code, message, hint) {
    super(message)
    this.name = 'LaunchError'
    this.code = code
    this.hint = hint
  }
}

/**
 * Whether a configured value names a path rather than a PATH lookup.
 * @param {string} value - configured binary.
 * @returns {boolean} true for absolute or separator-bearing values.
 */
export function isPathLike(value) {
  return isAbsolute(value) || value.includes('/') || value.includes('\\')
}

/**
 * Locate an executable on PATH using the platform extension rules.
 * @param {string} name - command name.
 * @param {NodeJS.ProcessEnv} [env] - environment to read PATH/PATHEXT from.
 * @returns {string | undefined} the first matching file.
 */
export function findOnPath(name, env = process.env) {
  const pathValue = env.PATH ?? env.Path ?? ''
  const directories = pathValue.split(delimiter).filter(entry => entry !== '')
  const extensions = WINDOWS
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  const ordered = extname(name) === '' ? ['', ...extensions] : ['']
  for (const directory of directories) {
    for (const extension of ordered) {
      const candidate = join(directory, name + extension)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        // Expected for most candidates: keep looking.
      }
    }
  }
  return undefined
}

/**
 * Read the Node script a Windows npm/pnpm shim launches.
 * @param {string} shimPath - absolute `.cmd`/`.bat` path.
 * @returns {{ script: string, via: string } | undefined} resolved script.
 */
function unwrapWindowsShim(shimPath) {
  let content
  try {
    content = readFileSync(shimPath, 'utf8')
  } catch {
    return undefined
  }
  const patterns = [
    /%dp0%\\?([^"\r\n]+\.(?:js|cjs|mjs))/i,
    /%~dp0\\?([^"\r\n]+\.(?:js|cjs|mjs))/i,
    /"%~dp0\\([^"]+\.(?:js|cjs|mjs))"/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(content)
    if (match === null) continue
    const script = resolve(dirname(shimPath), match[1])
    if (existsSync(script)) return { script, via: 'node-shim' }
  }
  return undefined
}

/**
 * Build the launch plan for the CLI.
 * @param {string} binary - configured binary name or path.
 * @param {readonly string[]} [prefixArgs] - arguments placed before CLI arguments.
 * @returns {{ command: string, args: string[], source: string, via: string }} plan.
 * @throws {LaunchError} when no executable can be located and launched safely.
 */
export function resolveCommand(binary, prefixArgs = []) {
  const located = isPathLike(binary)
    ? (existsSync(binary) ? resolve(binary) : undefined)
    : findOnPath(binary)
  if (located === undefined) {
    throw new LaunchError(
      'agy_auth_not_found',
      `could not find the agy-auth executable (${binary})`,
      'Install it with "npm install -g @fikrilal/agy-auth", or set the plugin binary option to the executable or Node launcher path.',
    )
  }
  const lower = located.toLowerCase()
  if (WINDOWS && SHIM_EXTENSIONS.some(extension => lower.endsWith(extension))) {
    const unwrapped = unwrapWindowsShim(located)
    if (unwrapped === undefined) {
      throw new LaunchError(
        'agy_auth_shim_unsupported',
        `cannot launch the Windows shim ${located} without a shell`,
        'Install the standalone binary, or set the plugin binary option to the packaged agy-auth .exe or to another launcher.',
      )
    }
    return { command: process.execPath, args: [unwrapped.script, ...prefixArgs], source: located, via: unwrapped.via }
  }
  return { command: located, args: [...prefixArgs], source: located, via: 'direct' }
}

/**
 * Run one child process with a timeout, cancellation, and bounded capture.
 * @param {object} options - launch options.
 * @param {string} options.command - executable.
 * @param {readonly string[]} options.args - arguments.
 * @param {NodeJS.ProcessEnv} options.env - complete child environment.
 * @param {number} options.timeoutMs - cooperative deadline.
 * @param {string} [options.stdin] - text written to the child before stdin closes.
 * @param {string} [options.cwd] - child working directory.
 * @param {AbortSignal} [options.signal] - caller cancellation.
 * @param {number} [options.maxBytes] - per-stream capture cap.
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean }>} outcome.
 */
export function runProcess({ command, args, env, timeoutMs, stdin, cwd, signal, maxBytes = DEFAULT_MAX_BYTES }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd === undefined ? {} : { cwd }),
    })
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let settled = false

    /**
     * Capture one stream without exceeding the cap.
     * @param {'stdout' | 'stderr'} which - target stream.
     * @param {Buffer} chunk - incoming bytes.
     */
    const capture = (which, chunk) => {
      const size = chunk.byteLength
      if (which === 'stdout') {
        if (stdoutBytes >= maxBytes) return
        stdoutBytes += size
        stdout += chunk.toString('utf8').slice(0, Math.max(0, maxBytes - (stdoutBytes - size)))
      } else {
        if (stderrBytes >= maxBytes) return
        stderrBytes += size
        stderr += chunk.toString('utf8').slice(0, Math.max(0, maxBytes - (stderrBytes - size)))
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    timer.unref()

    const onAbort = () => { child.kill('SIGKILL') }
    signal?.addEventListener('abort', onAbort, { once: true })

    /**
     * Remove timers and listeners exactly once.
     */
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    // A child that exits before stdin closes emits EPIPE here; the process
    // outcome is already reported by 'close', so the pipe error is noise.
    child.stdin.on('error', () => {})
    child.stdout.on('data', chunk => capture('stdout', Buffer.from(chunk)))
    child.stderr.on('data', chunk => capture('stderr', Buffer.from(chunk)))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new LaunchError('agy_auth_spawn_failed', `could not start agy-auth: ${error.message}`,
        'Check the plugin binary option and that the executable can run for this user.'))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise({ code, stdout, stderr, timedOut })
    })

    if (stdin !== undefined) {
      try {
        child.stdin.end(stdin)
      } catch {
        // The child closed its stdin before the write; the exit status wins.
      }
    } else if (child.stdin !== null && 'end' in child.stdin) {
      child.stdin.end()
    }
  })
}

/**
 * Parse the versioned JSON envelope from CLI stdout.
 * @param {string} stdout - captured stdout.
 * @returns {Record<string, unknown> | undefined} parsed envelope.
 */
export function parseEnvelope(stdout) {
  const text = stdout.replace(/^\uFEFF/, '').trim()
  if (text === '') return undefined
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Trim trailing process output for an error message.
 * @param {string} text - captured stream.
 * @returns {string} last non-empty line, capped.
 */
export function tailLine(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim() !== '')
  const last = lines.at(-1) ?? ''
  return last.length > 400 ? last.slice(-400) : last
}