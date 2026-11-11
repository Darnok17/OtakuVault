"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  // Submits with the surrounding <form> under this name.
  name?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  // "field" fills its column like an input; "compact" hugs its content (toolbars, filters).
  variant?: "field" | "compact";
  className?: string;
};

const TYPEAHEAD_MS = 500;

/**
 * The site's only dropdown. A button (role=combobox) shows the current value; the options open in
 * a popover portalled to <body>, so it is never clipped by a modal or a scrolling toolbar, and is
 * styled entirely from the active theme's --*-dropdown tokens.
 *
 * Keyboard: ↑/↓ move (and open), Home/End jump, Enter/Space pick, Escape closes, Tab closes and
 * moves on, typing letters jumps to the matching option.
 */
export default function ThemedSelect<T extends string>({
  value, onChange, options, name, id, disabled, variant = "compact", className, ...aria
}: Props<T>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const firstEnabled = useCallback((from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return -1;
  }, [options]);

  const openList = (at?: number) => {
    if (disabled) return;
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  // Place the popover under the trigger (or above it when there is no room) — written straight
  // to the element so opening doesn't need a second render.
  const place = useCallback(() => {
    const t = triggerRef.current, l = listRef.current;
    if (!t || !l) return;
    const r = t.getBoundingClientRect();
    const gap = 6, margin = 8;
    l.style.minWidth = `${r.width}px`;
    l.style.maxHeight = "";
    const natural = l.scrollHeight + 2;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const up = natural > below && above > below;
    const room = Math.max(120, up ? above : below);
    l.style.maxHeight = `${Math.min(room, 340)}px`;
    const h = Math.min(natural, room, 340);
    l.style.top = `${up ? r.top - gap - h : r.bottom + gap}px`;
    const w = l.offsetWidth;
    l.style.left = `${Math.max(margin, Math.min(r.left, window.innerWidth - w - margin))}px`;
    l.dataset.side = up ? "top" : "bottom";
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) place(); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (triggerRef.current?.contains(n) || listRef.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Keep the active option in view while arrowing through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const typeahead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > TYPEAHEAD_MS ? key : t.text + key;
    t.at = now;
    const q = t.text.toLowerCase();
    // A repeated single letter cycles through the options that start with it.
    const cycling = q.length > 1 && [...q].every((c) => c === q[0]);
    const needle = cycling ? q[0] : q;
    const start = open ? active : selectedIndex;
    const order = options.map((_, i) => (start + (cycling || q.length === 1 ? 1 : 0) + i + options.length) % options.length);
    const hit = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(needle));
    if (hit === undefined) return;
    if (open) setActive(hit);
    else if (options[hit].value !== value) onChange(options[hit].value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { e.preventDefault(); openList(); }
      else if (k === "Home") { e.preventDefault(); openList(firstEnabled(0, 1)); }
      else if (k === "End") { e.preventDefault(); openList(firstEnabled(options.length - 1, -1)); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(k);
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); const n = firstEnabled(active + 1, 1); if (n >= 0) setActive(n); }
    else if (k === "ArrowUp") { e.preventDefault(); const n = firstEnabled(active - 1, -1); if (n >= 0) setActive(n); }
    else if (k === "Home") { e.preventDefault(); setActive(firstEnabled(0, 1)); }
    else if (k === "End") { e.preventDefault(); setActive(firstEnabled(options.length - 1, -1)); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); pick(active); }
    else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === "Tab") close(false);
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        className={`ts-trigger ts-${variant}${open ? " open" : ""}${className ? ` ${className}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ts-value">{selected?.label ?? "Select…"}</span>
        <svg className="ts-chevron" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 1.5l5 5 5-5" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {open && createPortal(
        <ul ref={listRef} id={listId} className="ts-list" role="listbox" tabIndex={-1} aria-label={aria["aria-label"]}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${uid}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === selectedIndex}
              aria-disabled={o.disabled || undefined}
              className={`ts-option${i === active ? " active" : ""}${i === selectedIndex ? " selected" : ""}`}
              onPointerMove={() => { if (!o.disabled && active !== i) setActive(i); }}
              // Keep focus on the trigger so the keyboard keeps working after a click.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <span className="ts-option-label">{o.label}</span>
              {o.hint && <span className="ts-option-hint">{o.hint}</span>}
              <svg className="ts-check" width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 5.2l3.4 3.3L11 1.5" />
              </svg>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
