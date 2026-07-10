import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import employeesRoutes from "./modules/employees/employees.routes";
import sitesRoutes from "./modules/sites/sites.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import filesRoutes from "./modules/files/files.routes";
import tasksRoutes from "./modules/tasks/tasks.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import scoreboardRoutes from "./modules/scoreboard/scoreboard.routes";
import leavesRoutes from "./modules/leaves/leaves.routes";
import holidaysRoutes from "./modules/holidays/holidays.routes";
import settingsRoutes from "./modules/settings/settings.routes";

export function createApp() {
  const app = express();

  if (env.isProduction) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(helmet());

  // CLIENT_URL may be a single origin or comma-separated list (e.g. prod + preview).
  const allowedOrigins = env.clientUrl
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (health checks, curl) send no Origin.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (!env.isProduction) {
    app.use(morgan("dev"));
  }

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  // Company logos and other uploaded branding assets (also proxied via Vercel /assets).
  app.use("/assets", express.static(path.join(process.cwd(), "assets")));

  app.use("/api/auth", authRoutes);
  app.use("/api/employees", employeesRoutes);
  app.use("/api/sites", sitesRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/files", filesRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/scoreboard", scoreboardRoutes);
  app.use("/api/leaves", leavesRoutes);
  app.use("/api/holidays", holidaysRoutes);
  app.use("/api/settings", settingsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
