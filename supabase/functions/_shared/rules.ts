// Typed-as-any facade over the shared plain-JS game rules (also used by the browser client).
import * as Rules from './game/index.js';
// deno-lint-ignore no-explicit-any
export const G: any = Rules;
