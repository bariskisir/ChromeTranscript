/** Shared DOM element query helpers for popup and side panel entry points. */

/** Returns a required DOM element by id or throws a setup error. */
export function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

/** Returns a required button element by id or throws a setup error. */
export function requireButton(id: string): HTMLButtonElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Element is not a button: ${id}`);
  }
  return element;
}

/** Returns a required input element by id or throws a setup error. */
export function requireInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Element is not an input: ${id}`);
  }
  return element;
}

/** Returns a required select element by id or throws a setup error. */
export function requireSelect(id: string): HTMLSelectElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Element is not a select: ${id}`);
  }
  return element;
}
