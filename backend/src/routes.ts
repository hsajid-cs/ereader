import { Router } from "express";

import { annotationsRouter, bookAnnotationsRouter } from "./modules/annotations/routes";
import authRouter from "./modules/auth/routes";
import booksRouter from "./modules/books/routes";
import collectionsRouter from "./modules/collections/routes";
import progressRouter from "./modules/progress/routes";
import statsRouter from "./modules/stats/routes";
import syncRouter from "./modules/sync/routes";
import usersRouter from "./modules/users/routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/books", booksRouter);
router.use("/books", progressRouter);
router.use("/books", bookAnnotationsRouter);
router.use("/annotations", annotationsRouter);
router.use("/collections", collectionsRouter);
router.use("/stats", statsRouter);
router.use("/sync", syncRouter);

export default router;
