/* loading the main program here, so I can mock certain files easier */
import { bootstrap } from "./server";

bootstrap().catch(err => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
