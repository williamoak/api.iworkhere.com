import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";
import type { Express } from "express";

export function loadSwagger(app: Express) {
    const swaggerPath = path.join(process.cwd(), "swagger.json");
    const swaggerDoc = JSON.parse(fs.readFileSync(swaggerPath, "utf8"));

    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
}
