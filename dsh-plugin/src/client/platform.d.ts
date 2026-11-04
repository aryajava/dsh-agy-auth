/**
 * Minimal declarations for the DeepSeek Harness browser platform modules this
 * plugin consumes. The Host package `@deepseek-ai/dsh-client-ui-primitives` is
 * part of the page's platform module table; its shipped types are not
 * redistributed, so the used surface is declared here and verified against the
 * DSH source at build time.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
  }
  export const Button: (props: ButtonProps) => JSX.Element

  export const Input: (props: { icon?: ReactNode } & InputHTMLAttributes<HTMLInputElement> & { [key: `data-${string}`]: string | boolean | undefined }) => JSX.Element

  export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
  export const Tag: (props: { tone?: TagTone; className?: string; children?: ReactNode }) => JSX.Element

  export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
  export const StateDot: (props: { state: StateDotState; size?: number; className?: string; appearance?: 'dot' | 'step' }) => JSX.Element

  export const Modal: (props: {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    closeLabel?: string
    headless?: boolean
  }) => JSX.Element | null

  export interface IconProps {
    size?: number
    className?: string
  }
  export const IconUserOutlineRegular: (props: IconProps) => JSX.Element
  export const IconUsersOutlineRegular: (props: IconProps) => JSX.Element
  export const IconRefreshOutlineRegular: (props: IconProps) => JSX.Element
  export const IconPlusOutlineRegular: (props: IconProps) => JSX.Element
  export const IconTrashOutlineRegular: (props: IconProps) => JSX.Element
  export const IconCheckCircleFillRegular: (props: IconProps) => JSX.Element
  export const IconWarningTriangleOutlineRegular: (props: IconProps) => JSX.Element
  export const IconWarningOutlineRegular: (props: IconProps) => JSX.Element
  export const IconSettingsOutlineRegular: (props: IconProps) => JSX.Element
  export const IconCloseOutlineRegular: (props: IconProps) => JSX.Element
  export const IconGlobeOutlineRegular: (props: IconProps) => JSX.Element
  export const IconRightUpOutlineRegular: (props: IconProps) => JSX.Element
  export const IconEditOutlineRegular: (props: IconProps) => JSX.Element
  export const IconApiOutlineRegular: (props: IconProps) => JSX.Element
  export const IconBrowseOutlineRegular: (props: IconProps) => JSX.Element
  export const IconChecklistOutlineRegular: (props: IconProps) => JSX.Element
  export const IconChevronDownOutlineRegular: (props: IconProps) => JSX.Element
  export const IconCodeOutlineRegular: (props: IconProps) => JSX.Element
  export const IconSearchOutlineRegular: (props: IconProps) => JSX.Element
  export const IconSparkleRegular: (props: IconProps) => JSX.Element

  /** Shared 24px disclosure header used by the Host's own process and tool rows. */
  export const DisclosureRow: (props: {
    icon: ReactNode
    title: string
    open: boolean
    expandable: boolean
    onToggle: () => void
    running?: boolean
    expandOnRowClick?: boolean
    previewChevron?: boolean
    keepContentWhenOpen?: boolean
    collapsedContent?: ReactNode
    headerAccessory?: ReactNode
    children?: ReactNode
    className?: string
    rowClassName?: string
    contentClassName?: string
    contentLayoutClassName?: string
    leadingClassName?: string
    chevronClassName?: string
    titleClassName?: string
  }) => JSX.Element

  /** Display copy for the terminal surface; the owner supplies localized labels. */
  export interface TerminalBlockLabels {
    commandLine: (line: number) => string
    signal: (signal: string) => string
    exitCode: (code: number) => string
    noExitCode: string
    running: string
    failed: string
    done: string
    copy: string
    copied: string
    noOutput: string
    collapseAria: string
    collapse: string
    expandAria: (hidden: number) => string
    expand: (hidden: number) => string
  }

  /** Shell command plus its recorded output, drawn as the Host's terminal card. */
  export const TerminalBlock: (props: {
    command: string
    cwd?: string
    home?: string
    output?: string
    exitCode?: number | null
    signal?: string
    running?: boolean
    background?: boolean
    maxLines?: number
    copyText?: string
    runStateDot?: boolean
    className?: string
    labels: TerminalBlockLabels
  }) => JSX.Element
}
