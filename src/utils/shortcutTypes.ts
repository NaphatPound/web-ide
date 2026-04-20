import type { ShortcutType } from "../store/useIdeStore";

export interface ShortcutTypeMeta {
  value: ShortcutType;
  label: string;
  hint: string;
  buttonClass: string;
  swatchClass: string;
}

export const SHORTCUT_TYPE_META: Record<ShortcutType, ShortcutTypeMeta> = {
  command: {
    value: "command",
    label: "Command",
    hint: "send + Enter",
    buttonClass:
      "border-sky-400/50 text-sky-200 hover:bg-sky-500/20 bg-sky-500/10",
    swatchClass: "bg-sky-500/60 border-sky-400",
  },
  text: {
    value: "text",
    label: "Text",
    hint: "send, no Enter",
    buttonClass:
      "border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/20 bg-emerald-500/10",
    swatchClass: "bg-emerald-500/60 border-emerald-400",
  },
  template: {
    value: "template",
    label: "Template",
    hint: "popup fills {{vars}} → send + Enter",
    buttonClass:
      "border-violet-400/50 text-violet-200 hover:bg-violet-500/20 bg-violet-500/10",
    swatchClass: "bg-violet-500/60 border-violet-400",
  },
};

export const SHORTCUT_TYPE_LIST: ShortcutTypeMeta[] = [
  SHORTCUT_TYPE_META.command,
  SHORTCUT_TYPE_META.text,
  SHORTCUT_TYPE_META.template,
];
