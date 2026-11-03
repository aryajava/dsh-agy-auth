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
}
