// The interactive lessons, and the day each one belongs to.
import { M0 } from "./m0.js";
import { M1 } from "./m1.js";
import { M2 } from "./m2.js";
import { M3 } from "./m3.js";
import { M4 } from "./m4.js";
import { M8 } from "./m8.js";
import { M9 } from "./m9.js";
import { M12 } from "./m12.js";
import { M15 } from "./m15.js";
import { M43 } from "./m43.js";
import { M50 } from "./m50.js";
import { M64 } from "./m64.js";
import { M85 } from "./m85.js";
import { M99 } from "./m99.js";
import { M127 } from "./m127.js";
import { M141 } from "./m141.js";
import { M177 } from "./m177.js";
import { M183 } from "./m183.js";
import { M190 } from "./m190.js";
import { M197 } from "./m197.js";

export const LESSONS = { m0: M0, m1: M1, m2: M2, m3: M3, m4: M4, m8: M8, m9: M9, m12: M12, m15: M15, m43: M43, m50: M50, m64: M64, m85: M85, m99: M99, m127: M127, m141: M141, m177: M177, m183: M183, m190: M190, m197: M197 };
export const lessonForDay = n => Object.values(LESSONS).find(l => l.day === n) || null;
