/** Sidebar entry glyph for the Antigravity accounts page. */
import { IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Render the glyph at the size the sidebar asks for.
 * @param props.size - requested square edge.
 * @returns the icon.
 */
export function AgyAuthIcon({ size }: { size: number }) {
  return <IconUserOutlineRegular size={size} />
}
