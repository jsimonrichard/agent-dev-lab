"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import { JSON_TOKEN_CLASS } from "@/lib/highlight-json";
import { cn } from "@/lib/utils";

const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, class: JSON_TOKEN_CLASS.key },
  { tag: tags.string, class: JSON_TOKEN_CLASS.string },
  { tag: tags.number, class: JSON_TOKEN_CLASS.number },
  { tag: tags.bool, class: JSON_TOKEN_CLASS.boolean },
  { tag: tags.null, class: JSON_TOKEN_CLASS.null },
  { tag: tags.punctuation, class: JSON_TOKEN_CLASS.punctuation },
  { tag: tags.bracket, class: JSON_TOKEN_CLASS.punctuation },
  { tag: tags.squareBracket, class: JSON_TOKEN_CLASS.punctuation },
  { tag: tags.brace, class: JSON_TOKEN_CLASS.punctuation },
  { tag: tags.separator, class: JSON_TOKEN_CLASS.punctuation },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "5rem",
    backgroundColor: "transparent",
    fontSize: "0.75rem",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
  },
  ".cm-content": {
    padding: "0.5rem 0.75rem",
    caretColor: "var(--foreground)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    {
      backgroundColor: "color-mix(in oklab, var(--ring) 28%, transparent) !important",
    },
});

export function JsonCodeEditor({
  id,
  value,
  onChange,
  onBlur,
  autoFocus,
  fill = false,
  invalid = false,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  autoFocus?: boolean;
  fill?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const mountRef = useRef({ id, describedBy, autoFocus, value });
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  mountRef.current = { id, describedBy, autoFocus, value };

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      throw new Error("JsonCodeEditor: parent element missing on mount");
    }
    const {
      id: mountId,
      describedBy: mountDescribedBy,
      autoFocus: mountAutoFocus,
      value: mountValue,
    } = mountRef.current;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: mountValue,
        extensions: [
          json(),
          history(),
          EditorView.lineWrapping,
          syntaxHighlighting(jsonHighlight),
          editorTheme,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            ...(mountId ? { id: mountId } : {}),
            ...(mountDescribedBy ? { "aria-describedby": mountDescribedBy } : {}),
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: (_event, view) => {
              onBlurRef.current?.(view.state.doc.toString());
              return false;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (mountAutoFocus) {
      view.focus();
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current === value) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const content = viewRef.current?.contentDOM;
    if (!content) {
      return;
    }
    content.setAttribute("aria-invalid", invalid ? "true" : "false");
    if (describedBy) {
      content.setAttribute("aria-describedby", describedBy);
    } else {
      content.removeAttribute("aria-describedby");
    }
  }, [invalid, describedBy]);

  return (
    <div
      ref={parentRef}
      data-slot="json-code-editor"
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-md border border-input bg-transparent shadow-xs dark:bg-input/30",
        "has-[[contenteditable]:focus]:border-ring has-[[contenteditable]:focus]:ring-2 has-[[contenteditable]:focus]:ring-ring/40",
        invalid &&
          "border-destructive has-[[contenteditable]:focus]:border-destructive has-[[contenteditable]:focus]:ring-destructive/20 dark:has-[[contenteditable]:focus]:ring-destructive/40",
        fill ? "flex h-full min-h-0 flex-1 flex-col" : "min-h-20",
      )}
    />
  );
}
