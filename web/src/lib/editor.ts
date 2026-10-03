// Read-only editors must not trap Tab; editable ones keep it for indenting.
export const editorProps = (readOnly: boolean) => ({ editable: !readOnly, indentWithTab: !readOnly });
