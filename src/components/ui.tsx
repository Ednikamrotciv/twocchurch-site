import React, { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE, SPRING_SNAPPY, SPRING_SOFT, fold, modalBackdrop, modalPanel, rise, toastCard } from "../lib/motion";
import { Link } from "../lib/router";
import { useClickOutside, useToasts, useReveal, useBodyLock } from "../lib/hooks";
import { copyText, shareContent, whatsappLink, mailto } from "../lib/store";
import { absoluteLink } from "../lib/router";
import { ct } from "../data/copy";

/* ------------------------------------------------------------------ icons */

const ICONS: Record<string, ReactNode> = {
  cross: <><path d="M12 3v18" /><path d="M7 8h10" /></>,
  pencil: <><path d="M4 20h4L20 8a2.5 2.5 0 0 0-3.5-3.5L4 16z" /><path d="M14.5 6.5L17.5 9.5" /></>,
  wand: <><path d="M5 19l9-9" /><path d="M14 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /><path d="M19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 5.5v15" /><path d="M9 7h6" /></>,
  prayer: <><path d="M12 21c-3 0-5-2.2-5-5 0-2.1 1.2-3.3 2.2-4.6C10.3 10 11 8.6 11 6.5A2.5 2.5 0 0 1 13.5 4 2.5 2.5 0 0 1 16 6.5c0 .6-.1 1.1-.3 1.6" /><path d="M9 13l6 6" /><path d="M15 13l-3 3" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 11a3 3 0 1 0 0-6" /><path d="M18 20c0-2.4-.6-4-2-5" /></>,
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
  gift: <><path d="M4 11h16v9H4z" /><path d="M4 7h16v4H4z" /><path d="M12 7v13" /><path d="M12 7S10.5 3 8.5 3.8 9 7 12 7zM12 7s1.5-4 3.5-3.2S15 7 12 7z" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.6 2.6 15.4 0 18-2.6-2.6-2.6-15.4 0-18z" /></>,
  heart: <><path d="M12 20s-7-4.3-7-9.4A4.1 4.1 0 0 1 12 7.9 4.1 4.1 0 0 1 19 10.6c0 5.1-7 9.4-7 9.4z" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2l-2 5.6-5.6 2 2-5.6z" /></>,
  star: <><path d="M12 3.6l2.5 5.2 5.6.8-4 4 .9 5.7-5-2.7-5 2.7.9-5.7-4-4 5.6-.8z" /></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h2.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M20 14h-2.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z" /></>,
  archive: <><path d="M3 5h18v4H3z" /><path d="M5 9v11h14V9" /><path d="M10 13h4" /></>,
  live: <><circle cx="12" cy="12" r="3" /><path d="M7.5 7.5a6 6 0 0 0 0 9M16.5 16.5a6 6 0 0 0 0-9" /><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" /></>,
  play: <><path d="M8 5.5l11 6.5-11 6.5z" /></>,
  pause: <><path d="M9 5v14M15 5v14" /></>,
  stop: <><rect x="6.5" y="6.5" width="11" height="11" rx="1.8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></>,
  pin: <><path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" /><circle cx="12" cy="11" r="2.3" /></>,
  phone: <><path d="M5 3h3l2 5-2.2 1.4a12 12 0 0 0 6.8 6.8L16 14l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3z" /></>,
  mail: <><path d="M3 6h18v12H3z" /><path d="M3.5 6.8L12 13l8.5-6.2" /></>,
  whatsapp: <><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z" /><path d="M9 9.5c0 3 2.4 5.4 5.4 5.4.5 0 1-.5 1-1l-1.6-.8-1 .8c-1-.5-1.9-1.4-2.4-2.4l.8-1L10.4 9c-.5 0-1.4.2-1.4.5z" /></>,
  youtube: <><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5z" /><path d="M10.5 9.5l5 2.5-5 2.5z" /></>,
  facebook: <><path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H9v3.5h2V21h3.5v-6.5H17L17.5 11h-3V9.3c0-.5.3-.8.8-.8z" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17" cy="7" r="1" /></>,
  chevronRight: <><path d="M9.5 5.5l6.5 6.5-6.5 6.5" /></>,
  chevronLeft: <><path d="M14.5 5.5L8 12l6.5 6.5" /></>,
  chevronDown: <><path d="M5.5 9.5L12 16l6.5-6.5" /></>,
  chevronUp: <><path d="M5.5 14.5L12 8l6.5 6.5" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="M13.5 6.5L20 12l-6.5 5.5" /></>,
  arrowLeft: <><path d="M20 12H5" /><path d="M10.5 6.5L4 12l6.5 5.5" /></>,
  arrowUp: <><path d="M12 20V5" /><path d="M6.5 10.5L12 5l5.5 5.5" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  check: <><path d="M5 13l4.5 4.5L19 7" /></>,
  undo: <><path d="M4.6 11.4h10.2a4.4 4.4 0 0 1 0 8.8H9.2" /><path d="M8.6 7.4l-4 4 4 4" /></>,
  refresh: <><path d="M4.6 12a7.5 7.5 0 0 1 12.7-5.3" /><path d="M20 6.4V11h-4.5" /><path d="M19.4 12a7.5 7.5 0 0 1-12.7 5.3" /><path d="M4 17.6V13h4.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" /></>,
  moon: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></>,
  bookmark: <><path d="M7 3.5h10V21l-5-3.5L7 21z" /></>,
  download: <><path d="M12 4v10" /><path d="M7.5 10L12 14.5 16.5 10" /><path d="M4 19h16" /></>,
  share: <><circle cx="17" cy="6" r="2.4" /><circle cx="6.5" cy="12" r="2.4" /><circle cx="17" cy="18" r="2.4" /><path d="M8.7 10.9l6.1-3.3M8.7 13.1l6.1 3.3" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 6.5V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15h1" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-8.5 8.5" /><path d="M18 14v5.5A1.5 1.5 0 0 1 16.5 21h-12A1.5 1.5 0 0 1 3 19.5v-12A1.5 1.5 0 0 1 4.5 6H10" /></>,
  filter: <><path d="M4 6h16l-6 7v6l-4-2v-4z" /></>,
  quote: <><path d="M9 6.5C6.5 8 5 10.5 5 14v3.5h4.5V12H7.2c.3-1.6 1.2-2.9 2.6-3.8zM18 6.5C15.5 8 14 10.5 14 14v3.5h4.5V12h-2.3c.3-1.6 1.2-2.9 2.6-3.8z" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></>,
  trash: <><path d="M5 7h14" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l.9 13h9.2l.9-13" /><path d="M10.5 11v5M13.5 11v5" /></>,
  send: <><path d="M20 4L3.5 10.5l6 2.5 2.5 6z" /><path d="M20 4l-8.5 9" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.4" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.6v.4" /></>,
  map: <><path d="M9 4l6 2 5-2v16l-5 2-6-2-5 2V6z" /><path d="M9 4v16M15 6v16" /></>,
  sparkle: <><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  tag: <><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  clipboard: <><rect x="6" y="4.5" width="12" height="16" rx="2" /><path d="M9.5 4.5V3.5h5v1" /><path d="M9 10h6M9 14h4" /></>,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>,
  fire: <><path d="M12 3.5c3 4 5.5 6 5.5 9.5A5.5 5.5 0 0 1 6.5 13c0-2 .8-3.4 2.5-5 .3 1.4 1 2.2 2 2.5-.5-2.5.2-5.2 1-7z" /></>,
  ticket: <><path d="M4 8V6.5h16V8a2 2 0 0 0 0 4v5.5H4V12a2 2 0 0 0 0-4z" /><path d="M10 6.5v11" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  eye: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5z" /><path d="M4.5 16.5h15" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  link: <><path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1" /></>,
  monitor: <><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M9.5 20.5h5M12 16.5v4" /></>,
  smartphone: <><rect x="7.5" y="3" width="9" height="18" rx="2.2" /><path d="M11 18h2" /></>,
};

export type IconName = keyof typeof ICONS;

/* Lets a page open the site search that lives in the header, without either of
   them knowing about the other (the 404 page offers it). */
export const OPEN_SEARCH_EVENT = "wom:open-search";

export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  const node = ICONS[name] || ICONS.info;
  return (
    <svg
      className={"icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node}
    </svg>
  );
}

/* ------------------------------------------------------------------ buttons */

type BtnProps = {
  children?: ReactNode;
  to?: string;
  query?: Record<string, string | number | undefined>;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  variant?: "gold" | "crimson" | "ghost" | "quiet" | "link";
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconRight?: string;
  block?: boolean;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
};

export function Btn({
  children,
  to,
  query,
  href,
  onClick,
  variant = "gold",
  size = "md",
  icon,
  iconRight,
  block,
  className = "",
  disabled,
  type = "button",
  title,
  ariaLabel,
}: BtnProps) {
  const cls = ["btn", `btn--${variant}`, size !== "md" ? `btn--${size}` : "", block ? "btn--block" : "", className].filter(Boolean).join(" ");
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 18} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 18} />}
    </>
  );
  if (to) {
    return (
      <Link to={to} query={query} className={cls} onClick={onClick as any} title={title} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} type={type} onClick={onClick as any} disabled={disabled} title={title} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}

export function IconBtn({ name, label, onClick, href, className = "" }: { name: string; label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; href?: string; className?: string }) {
  if (href) {
    return (
      <a className={"icon-btn " + className} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}>
        <Icon name={name} size={18} />
      </a>
    );
  }
  return (
    <button type="button" className={"icon-btn " + className} onClick={onClick} title={label} aria-label={label}>
      <Icon name={name} size={18} />
    </button>
  );
}

/* A toggle switch: on/off with a sliding knob. Controlled — pass `checked` and
   flip it in `onChange`. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={"switch" + (checked ? " is-on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------ layout atoms */

export function Section({ children, id, className = "", tone = "" }: { children: ReactNode; id?: string; className?: string; tone?: "" | "light" | "raised" }) {
  return (
    <section id={id} className={["section", tone ? `section--${tone}` : "", className].filter(Boolean).join(" ")}>
      <div className="container">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, center }: { children: ReactNode; center?: boolean }) {
  return <p className={"eyebrow" + (center ? " center" : "")}>{children}</p>;
}

/* ---------------------------------------------------------------- rich text */

/* Renders the light markup the office can type in the admin console:
     *emphasis*  **strong**  [label](/route)  [label](https://…)  and newlines.
   Everything else is plain text. */
const RICH_TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

export function Rich({ text }: { text: string }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {line.split(RICH_TOKEN).filter((part) => part !== "").map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
              return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
              return <em key={i}>{part.slice(1, -1)}</em>;
            }
            const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
            if (link) {
              const label = link[1];
              const href = link[2];
              if (href.startsWith("/")) {
                return (
                  <Link key={i} to={href}>
                    {label}
                  </Link>
                );
              }
              return (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              );
            }
            return <React.Fragment key={i}>{part}</React.Fragment>;
          })}
        </React.Fragment>
      ))}
    </>
  );
}

export function Rule({ label, center = true }: { label?: string; center?: boolean }) {
  if (!label) return <div className={"rule" + (center ? " center" : "")} aria-hidden="true"><span /></div>;
  return (
    <div className={"rule rule--label" + (center ? " center" : "")}>
      <span />
      <em>{label}</em>
      <span />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  center,
  actions,
  as = "h2",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  center?: boolean;
  actions?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  const Tag = as as any;
  return (
    <header className={"section-head" + (center ? " center" : "")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Tag className="section-title">{title}</Tag>
      {lede && <p className="lede">{lede}</p>}
      {actions && <div className="section-head__actions">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", pad = true, hover = false, as = "div" }: { children: ReactNode; className?: string; pad?: boolean; hover?: boolean; as?: any }) {
  const Tag = as;
  return <Tag className={["card", pad ? "card--pad" : "", hover ? "card--hover" : "", className].filter(Boolean).join(" ")}>{children}</Tag>;
}

export function Badge({ children, accent = "gold", icon }: { children: ReactNode; accent?: string; icon?: string }) {
  return (
    <span className={`badge badge--${accent}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

export function Chip({ children, active, onClick, count, icon }: { children: ReactNode; active?: boolean; onClick?: () => void; count?: number; icon?: string }) {
  return (
    <button type="button" className={"chip" + (active ? " chip--active" : "")} onClick={onClick} aria-pressed={active}>
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
      {count !== undefined && <em className="chip__count">{count}</em>}
    </button>
  );
}

export function Stat({ value, label, suffix = "", animate = true }: { value: number; label: string; suffix?: string; animate?: boolean }) {
  const ref = useReveal<HTMLDivElement>();
  const [shown, setShown] = useState(animate ? 0 : value);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    let raf = 0;
    const start = () => {
      if (done.current) return;
      done.current = true;
      const t0 = performance.now();
      const dur = 1400;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // Final safety: if rAF never runs (throttled/hidden tab), settle on the real figure.
      window.setTimeout(() => setShown(value), dur + 300);
    };
    let obs: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            start();
            obs?.disconnect();
          }
        },
        { threshold: 0.4 }
      );
      obs.observe(el);
    }
    // Safety net: never leave the figures frozen at zero if the observer misfires.
    const fallback = window.setTimeout(start, 2200);
    return () => {
      obs?.disconnect();
      window.clearTimeout(fallback);
      cancelAnimationFrame(raf);
    };
  }, [value, animate, ref]);
  return (
    <div className="stat" ref={ref}>
      <div className="stat__value">
        {shown.toLocaleString()}
        {suffix}
      </div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function Monogram({ name, letters, size = 48, tone = "gold" }: { name: string; letters?: string; size?: number; tone?: string }) {
  const explicit = String(letters || "").trim().toUpperCase().slice(0, 2);
  const initials =
    explicit ||
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  return (
    <span className={`monogram monogram--${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials || "★"}
    </span>
  );
}

export function Progress({ value, max = 100, tone = "gold" }: { value: number; max?: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`progress__bar progress__bar--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} className={"tab" + (active === t.id ? " tab--active" : "")} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <em>{t.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = "info", title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function Notice({ children, icon = "info", tone = "gold" }: { children: ReactNode; icon?: string; tone?: string }) {
  return (
    <div className={`notice notice--${tone}`}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Loader({ label = ct("auto.site.eebf8a74ab3dd8fd") }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader__ring" />
      <span className="muted">{label}…</span>
    </div>
  );
}

export function Reveal({ children, delay = 0, className = "", as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: any }) {
  const tag = typeof as === "string" ? as : "div";
  const MTag = ((motion as any)[tag] ?? motion.div) as typeof motion.div;
  return (
    <MTag
      className={["mreveal", className].filter(Boolean).join(" ")}
      variants={rise}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: ct("auto.site.eb0695f10668f798") }}
      transition={{ duration: 0.65, ease: EASE, delay: Math.min(delay, 400) / 1000 }}
    >
      {children}
    </MTag>
  );
}

export function Tiles({ items, cols = 4 }: { items: { icon?: string; title: string; text: string }[]; cols?: number }) {
  return (
    <div className={`grid grid-${cols}`}>
      {items.map((v, i) => (
        <Reveal key={v.title} delay={i * 40}>
          <Card className="tile-card" hover>
            {v.icon && (
              <span className="tile-card__icon">
                <Icon name={v.icon} size={22} />
              </span>
            )}
            <h3>{v.title}</h3>
            <p>{v.text}</p>
          </Card>
        </Reveal>
      ))}
    </div>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="tag-list">
      {tags.map((t) => (
        <span key={t} className="tag">
          <Icon name="tag" size={12} />
          {t}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({ label, hint, error, children, htmlFor, required }: { label?: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <div className={"field" + (error ? " field--error" : "")}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error"><Icon name="alert" size={13} /> {error}</p>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export function Input({ invalid, className = "", ...rest }: InputProps) {
  return <input className={["input", invalid ? "input--invalid" : "", className].filter(Boolean).join(" ")} {...rest} />;
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };
export function Textarea({ invalid, className = "", ...rest }: TextareaProps) {
  return <textarea className={["textarea", invalid ? "input--invalid" : "", className].filter(Boolean).join(" ")} {...rest} />;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options: { value: string; label: string }[] };
export function Select({ invalid, options, className = "", ...rest }: SelectProps) {
  return (
    <select className={["select", invalid ? "input--invalid" : "", className].filter(Boolean).join(" ")} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__box" aria-hidden="true">
        <Icon name="check" size={13} />
      </span>
      <span className="check__label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={"switch" + (checked ? " switch--on" : "")} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  /* Entrance and exit share the site's motion language (src/lib/motion.ts):
     the backdrop fades through a blur, the panel rises on a soft spring. The
     command palette keeps its own CSS keyframes; reduced motion quiets this
     via the root MotionConfig. */
  return (
    <AnimatePresence>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
          <motion.div
            className="modal__backdrop"
            onClick={onClose}
            variants={modalBackdrop}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={{ duration: 0.25, ease: EASE }}
          />
          <motion.div
            className={`modal__panel modal__panel--${size}`}
            variants={modalPanel}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={SPRING_SOFT}
          >
            <div className="modal__head">
              {title ? <h2>{title}</h2> : <span />}
              <IconBtn name="close" label={ct("auto.site.b10893f04318c4b9")} onClick={onClose} />
            </div>
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ toasts */

export function Toaster() {
  const toasts = useToasts();
  /* One spring language with the modals; the stack reflows with layout and
     popLayout so a dismissed toast hands its space over instead of jumping.
     The live region stays a plain wrapper so announcements never depend on
     animation. */
  return (
    <div className="toaster" role="status" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast--${t.kind}`}
            variants={toastCard}
            initial="hidden"
            animate="shown"
            exit="gone"
            transition={SPRING_SNAPPY}
          >
            <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={16} />
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label={ct("auto.site.cda5881bd5fcacca")}>
      {items.map((item, i) => (
        <span key={i}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <em>{item.label}</em>}
          {i < items.length - 1 && <Icon name="chevronRight" size={13} />}
        </span>
      ))}
    </nav>
  );
}

export function ShareRow({ title, path, text }: { title: string; path: string; text?: string }) {
  const url = absoluteLink(path);
  return (
    <div className="share-row">
      <button type="button" className="share-btn" onClick={() => shareContent({ title, text, url })}>
        <Icon name="share" size={16} /> {ct("auto.site.e2ca6a2bbfaa9002")}</button>
      <button type="button" className="share-btn" onClick={() => copyText(url, ct("auto.site.7d490c386df464e9"))}>
        <Icon name="link" size={16} /> {ct("auto.site.839ed6cbeb32e9b2")}</button>
      <a className="share-btn" href={whatsappLink(`${title} — ${url}`)} target="_blank" rel="noopener noreferrer">
        <Icon name="whatsapp" size={16} /> {ct("auto.site.08493e84d7e86f8d")}</a>
      <a className="share-btn" href={mailto("", title, `${text || ""}\n\n${url}`)}>
        <Icon name="mail" size={16} /> {ct("auto.site.09f19666879d609f")}</a>
    </div>
  );
}

export function CopyButton({ text, label = ct("auto.site.365196af61d01116"), message }: { text: string; label?: string; message?: string }) {
  return (
    <button type="button" className="copy-btn" onClick={() => copyText(text, message || ct("auto.site.1607d62c65a78d9d"))}>
      <Icon name="copy" size={15} /> {label}
    </button>
  );
}

export function useOutside<T extends HTMLElement>(onOutside: () => void) {
  return useClickOutside<T>(onOutside);
}

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="collapse"
          variants={fold}
          initial="hidden"
          animate="shown"
          exit="gone"
          transition={{ duration: 0.32, ease: EASE }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Accordion({
  items,
  defaultOpen = -1,
  numbered = false,
}: {
  items: { q: string; a: ReactNode; verse?: string }[];
  defaultOpen?: number;
  numbered?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"accordion" + (numbered ? " accordion--numbered" : "")}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={"accordion__item" + (isOpen ? " accordion__item--open" : "")}>
            <button type="button" className="accordion__q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
              {numbered && <span className="accordion__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>}
              <span className="accordion__q-text">{item.q}</span>
              <span className="accordion__icon" aria-hidden="true">
                <Icon name="chevronDown" size={17} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  className="accordion__panel"
                  aria-hidden={false}
                  variants={fold}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  transition={{ duration: 0.34, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="accordion__panel-inner">
                    <div className="accordion__a">
                      <p>{item.a}</p>
                      {item.verse && <p className="accordion__verse">— {item.verse}</p>}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
