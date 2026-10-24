import { beforeAll } from "vitest";
import { __setTestModelCatalog } from "@/modules/ai/core/models/model.registry";
import { FIXTURE_MODEL_CATALOG } from "../fixtures-model-catalog";

beforeAll(() => { __setTestModelCatalog(FIXTURE_MODEL_CATALOG); });
