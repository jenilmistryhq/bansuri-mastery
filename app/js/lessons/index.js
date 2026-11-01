// The interactive lessons, and the day each one belongs to.
import { M0 } from "./m0.js";
import { M1 } from "./m1.js";
import { M2 } from "./m2.js";
import { M3 } from "./m3.js";
import { M4 } from "./m4.js";

export const LESSONS = { m0: M0, m1: M1, m2: M2, m3: M3, m4: M4 };
export const lessonForDay = n => Object.values(LESSONS).find(l => l.day === n) || null;
