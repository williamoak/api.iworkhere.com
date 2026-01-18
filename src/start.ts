import { bootstrap } from "./server";

bootstrap().catch(err => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
