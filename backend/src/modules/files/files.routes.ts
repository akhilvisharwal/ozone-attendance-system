import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { getFile } from "./files.controller";

const router = Router();

router.get("/*", requireAuth, getFile);

export default router;
