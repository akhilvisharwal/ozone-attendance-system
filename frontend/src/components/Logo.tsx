import clsx from "clsx";
import { Link } from "react-router-dom";
import type { MouseEvent } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  ADMIN_DASHBOARD_PATH,
  EMPLOYEE_DASHBOARD_PATH,
  LOGO_ALT,
  LOGO_SRC,
  SYSTEM_NAME,
} from "@/config/branding";
import { useCompanyLogoUrl, useCompanyName } from "@/contexts/SettingsContext";

export type LogoVariant = "sidebar" | "header" | "hero" | "compact" | "print";

export interface LogoProps {
  variant?: LogoVariant;
  interactive?: boolean;
  className?: string;
  onNavigate?: () => void;
}

function useDashboardHref(): string {
  const { employee } = useAuth();
  if (employee?.role === "admin") return ADMIN_DASHBOARD_PATH;
  return EMPLOYEE_DASHBOARD_PATH;
}

function useDashboardLabel(): string {
  const { employee } = useAuth();
  if (employee?.role === "admin") return "Admin Dashboard";
  if (employee?.role === "employee") return "Employee Dashboard";
  return SYSTEM_NAME;
}

export function Logo({
  variant = "sidebar",
  interactive = true,
  className,
  onNavigate,
}: LogoProps) {
  const href = useDashboardHref();
  const label = useDashboardLabel();
  const companyName = useCompanyName();
  const dynamicLogo = useCompanyLogoUrl();
  const logoSrc = dynamicLogo ?? LOGO_SRC;
  const logoAlt = `${companyName} — ${LOGO_ALT.split("—").pop()?.trim() ?? "Logo"}`;

  const image = (
    <img
      src={logoSrc}
      alt={logoAlt}
      className="logo-brand__img"
      decoding="async"
      draggable={false}
      onError={(e) => {
        if (e.currentTarget.src !== LOGO_SRC) e.currentTarget.src = LOGO_SRC;
      }}
    />
  );

  const shellClass = clsx("logo-brand", `logo-brand--${variant}`, className);

  if (!interactive) {
    return (
      <div className={shellClass} aria-hidden={variant === "print" ? undefined : false}>
        {image}
      </div>
    );
  }

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onNavigate?.();
    if (window.location.pathname === href) {
      e.preventDefault();
    }
  }

  return (
    <Link
      to={href}
      className={clsx(shellClass, "logo-brand--interactive")}
      aria-label={`${logoAlt} — go to ${label}`}
      title={`Go to ${label}`}
      onClick={handleClick}
    >
      {image}
    </Link>
  );
}

export function LogoMark(props: Omit<LogoProps, "interactive">) {
  return <Logo {...props} interactive={false} variant={props.variant ?? "compact"} />;
}
