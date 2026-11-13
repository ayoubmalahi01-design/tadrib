import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";

/**
 * Shared presentation primitives.
 *
 * Every page composes these so spacing, headings, empty states and loading
 * states stay consistent across Arabic/French/English and RTL/LTR layouts.
 * They are presentation-only: no data access, no side effects.
 */

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-heading">
        {icon && <span className="ui-page-icon">{icon}</span>}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-panel ${className}`.trim()}>
      {(title || actions) && (
        <div className="ui-panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "accent" | "warn" | "danger";
}) {
  return (
    <div className={`ui-stat ui-stat-${tone}`}>
      {icon && <span className="ui-stat-icon">{icon}</span>}
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
        {hint && <em>{hint}</em>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "info";
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon">{icon ?? <Inbox size={26} />}</span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="ui-loading" role="status" aria-live="polite">
      <Loader2 className="ui-spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ui-error" role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>{title}</strong>
        {message && <p>{message}</p>}
      </div>
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
      {hint && !error && <span className="ui-field-hint">{hint}</span>}
      {error && <span className="ui-field-error">{error}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) {
  return (
    <div
      className="ui-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ui-modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={closeLabel ?? "Close"}
          >
            <X size={18} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}
