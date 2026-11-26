export interface CancelKey { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; }
// Browser/menu modifiers and the panel shortcut do not interrupt a collection.
export function cancelsNavigation(key: CancelKey): boolean {
  return !key.altKey && !key.ctrlKey && !key.metaKey &&
    !['Alt', 'AltGraph', 'Control', 'Meta', 'Shift'].includes(key.key) &&
    !(key.shiftKey && key.key.toLowerCase() === 'o');
}
