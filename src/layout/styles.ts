// Styles for sheet layouts. These are also in Archivium's styles.css
// (src/static/assets/styles.css, "Sheet layouts" section); this copy is only
// injected until the Archivium stylesheet we load includes them.
export const LAYOUT_TAB_CSS = `
.tab-layout {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tab-layout-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.tab-layout-section {
  min-width: min(100%, 6rem);
  border: 1px solid var(--table-border-color);
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: var(--sheet-color);
}

.tab-layout-title {
  margin: 0;
  padding: 0.25rem 0.75rem;
  background-color: var(--menu-color);
  font-family: 'Lora', serif;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tab-layout-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}

.tab-layout-stat .tab-layout-title {
  font-size: 0.75rem;
  text-align: center;
}

.tab-layout-stat .tab-layout-body {
  align-items: center;
  justify-content: center;
}

.tab-layout-stat-value {
  font-family: 'Lora', serif;
  font-size: 2rem;
  line-height: 1;
}

.tab-layout-field {
  display: flex;
  flex-direction: column;
}

.tab-layout-field input:not([type=checkbox]),
.tab-layout-textarea {
  width: 100%;
  box-sizing: border-box;
}

.tab-layout-textarea {
  min-height: 3rem;
  padding: 0.5rem;
  resize: vertical;
  font: inherit;
  color: var(--text-color);
  background-color: var(--sheet-color);
  border: 1px solid var(--input-border-color);
  border-radius: 0.25rem;
}

.tab-layout-text {
  min-height: 1.5rem;
  white-space: pre-wrap;
  border-bottom: 1px solid var(--input-border-color);
}

.tab-layout-caption {
  font-size: 0.875rem;
  color: var(--light-text-color);
}

.tab-layout-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tab-layout-rating {
  min-width: 7.5rem;
  font-family: 'Lora', serif;
}

.tab-layout-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex-grow: 1;
}

.tab-layout-box {
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

.tab-layout-locked {
  opacity: 0.35;
}

.tab-layout-problems {
  margin: 0;
}
`;
