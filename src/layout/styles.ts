// Styles for sheet layouts. These are also in Archivium's styles.css
// (src/static/assets/styles.css, "Sheet layouts" section); this copy is only
// injected until the Archivium stylesheet we load includes them.
export const SHEET_LAYOUT_CSS = `
.sheet-layout {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sheet-layout-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.sheet-layout-section {
  min-width: min(100%, 6rem);
  border: 1px solid var(--table-border-color);
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: var(--sheet-color);
}

.sheet-layout-title {
  margin: 0;
  padding: 0.25rem 0.75rem;
  background-color: var(--menu-color);
  font-family: 'Lora', serif;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.sheet-layout-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}

.sheet-layout-stat .sheet-layout-title {
  font-size: 0.75rem;
  text-align: center;
}

.sheet-layout-stat .sheet-layout-body {
  align-items: center;
  justify-content: center;
}

.sheet-layout-stat-value {
  font-family: 'Lora', serif;
  font-size: 2rem;
  line-height: 1;
}

.sheet-layout-field {
  display: flex;
  flex-direction: column;
}

.sheet-layout-field input:not([type=checkbox]),
.sheet-layout-textarea {
  width: 100%;
  box-sizing: border-box;
}

.sheet-layout-textarea {
  min-height: 3rem;
  padding: 0.5rem;
  resize: vertical;
  font: inherit;
  color: var(--text-color);
  background-color: var(--sheet-color);
  border: 1px solid var(--input-border-color);
  border-radius: 0.25rem;
}

.sheet-layout-text {
  min-height: 1.5rem;
  white-space: pre-wrap;
  border-bottom: 1px solid var(--input-border-color);
}

.sheet-layout-caption {
  font-size: 0.875rem;
  color: var(--light-text-color);
}

.sheet-layout-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sheet-layout-rating {
  min-width: 7.5rem;
  font-family: 'Lora', serif;
}

.sheet-layout-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex-grow: 1;
}

.sheet-layout-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  min-height: 2rem;
  padding: 0.25rem 0;
  border: 1px solid var(--input-border-color);
  border-radius: 0.25rem;
  font-family: 'Lora', serif;
}

.sheet-layout-locked {
  opacity: 0.35;
}

.sheet-layout-problems {
  margin: 0;
}
`;
