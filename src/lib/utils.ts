import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 音对名 → 语义色工具类（配合 index.css 的 --pair-* tokens） */
export function pairColorVar(pair: string): string {
  return { "in/ing": "var(--pair-in)", "en/eng": "var(--pair-en)", "l/n": "var(--pair-ln)" }[pair] || "var(--primary)";
}

export function pairTextClass(pair: string): string {
  return { "in/ing": "text-pair-in", "en/eng": "text-pair-en", "l/n": "text-pair-ln" }[pair] || "text-primary";
}

export function pairBgClass(pair: string): string {
  return { "in/ing": "bg-pair-in", "en/eng": "bg-pair-en", "l/n": "bg-pair-ln" }[pair] || "bg-primary";
}

export function pairBorderClass(pair: string): string {
  return { "in/ing": "border-pair-in", "en/eng": "border-pair-en", "l/n": "border-pair-ln" }[pair] || "border-primary";
}
