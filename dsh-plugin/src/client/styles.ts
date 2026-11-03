/** Global stylesheet for the Antigravity page, injected once per plugin life. */
export const PANEL_CSS = `
.agy-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 14px;
  line-height: 1.6;
  scrollbar-gutter: stable;
  --dsh-scrollbar-width: 9px;
  --dsh-scrollbar-thumb-border: 2px;
}

.agy-page-inner {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 28px clamp(24px, 4vw, 48px) 48px;
}

[data-platform='darwin'] .agy-page-inner {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}

.agy-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.agy-head-copy h1 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 500;
}

.agy-head-copy p {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

.agy-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.agy-updated {
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  white-space: nowrap;
}

.agy-notice,
.agy-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.agy-notice > div,
.agy-banner > div {
  flex: 1;
  min-width: 0;
}

.agy-notice p,
.agy-banner p {
  margin: 0;
}

.agy-notice[data-tone='success'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 36%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
}

.agy-notice[data-tone='error'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 36%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
}

.agy-notice[data-tone='info'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent);
}

.agy-notice-hint,
.agy-banner-hint {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-banner {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, var(--dsw-alias-bg-layer-1));
}

.agy-banner > svg {
  flex: none;
  margin-top: 2px;
  color: var(--dsw-alias-state-warn-label);
}

.agy-warnings {
  margin: 0 0 16px;
  padding: 8px 12px 8px 26px;
  border-radius: 10px;
  background: var(--dsw-specific-sidebar-fill);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-skeleton {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 220px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
}

.agy-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 560px;
  margin: 24px auto 0;
  padding: 48px 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}

.agy-empty > svg {
  margin-bottom: 12px;
  color: var(--dsw-alias-label-caption);
}

.agy-empty h2 {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
}

.agy-empty p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 20px;
}

.agy-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 10px;
}

.agy-install {
  margin-top: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-mono);
  font-size: 12px;
}

.agy-accounts {
  margin-bottom: 28px;
}

.agy-accounts-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 10px;
}

.agy-accounts-head h2 {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}

.agy-accounts-head .agy-hint {
  margin: 0;
}

.agy-account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agy-account {
  position: relative;
  padding: 16px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1);
  transition: border-color 0.15s, background 0.15s;
}

.agy-account[data-active='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-layer-1));
}

.agy-account[data-active='true']::before {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: -1px;
  width: 2px;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary);
  content: '';
}

.agy-account[aria-busy='true'] {
  opacity: 0.75;
}

.agy-account-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agy-identity {
  min-width: 0;
}

.agy-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.agy-name {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-email {
  margin-top: 2px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-meta {
  margin-top: 2px;
  overflow: hidden;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-row-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.agy-in-use {
  margin-right: 4px;
  color: var(--dsw-alias-state-success-primary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.agy-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.agy-icon-button:disabled {
  opacity: 0.4;
  cursor: default;
}

@media (hover: hover) {
  .agy-icon-button:not(:disabled):hover {
    background: var(--dsw-alias-fill-l1);
    color: var(--dsw-alias-label-secondary);
  }

  .agy-icon-danger:not(:disabled):hover {
    color: var(--dsw-alias-state-error-primary);
  }
}

.agy-icon-button:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.agy-quotas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 28px;
  margin-top: 14px;
}

.agy-quota-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.agy-quota-group {
  min-width: 0;
  padding-top: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
}

.agy-quota-group:first-child {
  padding-top: 0;
  border-top: 0;
}

.agy-quota-group-head h4 {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.agy-quota-group[data-family^='Gemini 4 Argon'] .agy-quota-group-head h4 {
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary));
}

.agy-quota-group-head p {
  margin: 2px 0 8px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 17px;
}

.agy-quota-group-bars {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 28px;
}

.agy-quota {
  min-width: 0;
}

.agy-quota-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.agy-quota-value {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.agy-quota-value[data-tone='success'] {
  color: var(--dsw-alias-state-success-primary);
}

.agy-quota-value[data-tone='warning'] {
  color: var(--dsw-alias-state-warn-label);
}

.agy-quota-value[data-tone='critical'] {
  color: var(--dsw-alias-state-error-primary);
}

.agy-bar {
  height: 6px;
  margin: 5px 0 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--dsw-alias-fill-l2);
}

.agy-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-label-caption);
  transition: width 0.2s ease;
}

.agy-bar[data-tone='success'] .agy-bar-fill {
  background: var(--dsw-alias-state-success-primary);
}

.agy-bar[data-tone='warning'] .agy-bar-fill {
  background: var(--dsw-alias-state-warn-primary);
}

.agy-bar[data-tone='critical'] .agy-bar-fill {
  background: var(--dsw-alias-state-error-primary);
}

.agy-quota-reset {
  display: block;
  overflow: hidden;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-activity {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0 4px;
}

.agy-activity-title {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.agy-activity-card {
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-fill-l1);
}

.agy-activity-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.agy-activity-head code {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-activity-kind {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.agy-activity-command,
.agy-activity-output,
.agy-activity-error {
  margin: 0;
  padding: 9px 10px;
  overflow-x: auto;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

.agy-activity-command {
  color: var(--dsw-alias-label-primary);
}

.agy-activity-output {
  max-height: 260px;
  overflow-y: auto;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-secondary);
}

.agy-activity-error {
  border-top: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-state-error-primary);
}

.agy-activity-path {
  padding: 7px 10px 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-activity-note {
  margin: 0;
  padding: 7px 10px 9px;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-state-warn-label);
  font-size: 11px;
  line-height: 17px;
  overflow-wrap: anywhere;
}

.agy-activity-note code {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.agy-activity-empty {
  margin: 0;
  padding: 7px 10px 9px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
}

.agy-usage-error {
  margin: 10px 0 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}

.agy-footnote {
  margin: 12px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-storage {
  margin: 8px 0 28px;
  padding: 16px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1);
}

.agy-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.agy-section-head h2 {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}

.agy-section-head p {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-section-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.agy-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
  margin: 0;
}

.agy-fact {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  padding: 6px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
}

.agy-fact:nth-child(-n + 2) {
  border-top: 0;
}

.agy-fact dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-fact dd {
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-mono {
  font-family: var(--dsw-font-mono);
  font-size: 11px;
}

.agy-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 16px;
  margin-top: 8px;
  padding-top: 14px;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 16px;
}

.agy-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.agy-field-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
}

.agy-field > span {
  width: 100%;
}

.agy-field input {
  box-sizing: border-box;
  width: 100%;
}

.agy-hint {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.agy-dialog-text {
  margin: 0 0 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.agy-dialog-error {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}

.agy-dialog-hint {
  color: var(--dsw-alias-label-tertiary);
}

.agy-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.agy-check input {
  margin: 3px 0 0;
  accent-color: var(--dsw-alias-state-business-primary);
}

.agy-steps {
  margin: 0 0 12px;
  padding-left: 20px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 22px;
}

.agy-link {
  color: var(--dsw-alias-state-business-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.agy-link:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.agy-code-input input {
  font-family: var(--dsw-font-mono);
  font-size: 12px;
}

.agy-login-progress,
.agy-login-done {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.agy-login-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}

.agy-clean-list {
  max-height: 240px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
}

.agy-clean-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.agy-clean-list code {
  overflow: hidden;
  font-family: var(--dsw-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-clean-list span {
  flex: none;
  color: var(--dsw-alias-label-caption);
}

.agy-danger-button {
  color: var(--dsw-alias-state-error-primary);
  --dsh-button-outline-color: var(--dsw-alias-state-error-primary);
}

.agy-page :focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.agy-page input:focus-visible {
  outline: none;
}

@media (max-width: 900px) {
  .agy-facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .agy-fact:nth-child(2) {
    border-top: 0.5px solid var(--dsw-alias-border-l4);
  }
}

@media (max-width: 720px) {
  .agy-page-inner {
    padding: 20px 16px 32px;
  }

  .agy-head-actions {
    justify-content: flex-start;
  }

  .agy-account-head {
    flex-direction: column;
    gap: 10px;
  }

  .agy-row-actions {
    width: 100%;
  }

  .agy-quotas,
  .agy-quota-group-bars {
    grid-template-columns: minmax(0, 1fr);
  }

  .agy-footer {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agy-bar-fill {
    transition: none;
  }
}
`;

/**
 * Install the stylesheet once and return its disposer.
 * @returns disposer removing the injected tag.
 */
export function installStyles(): () => void {
  const id = 'dsh-agy-auth'
  const existing = document.querySelector('style[data-plugin-css="' + id + '"]')
  if (existing !== null) return () => { existing.remove() }
  const tag = document.createElement('style')
  tag.dataset.pluginCss = id
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}