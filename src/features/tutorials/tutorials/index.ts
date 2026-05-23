import type { TutorialDef, TutorialId } from "../engine/types";
import { PLAY_AUTHORING_TUTORIAL } from "./playAuthoring";
import { BUILD_DEFENSE_TUTORIAL } from "./buildDefense";
import { USE_FORMATIONS_TUTORIAL } from "./useFormations";

export const TUTORIALS: Record<TutorialId, TutorialDef> = {
  play_authoring_v1: PLAY_AUTHORING_TUTORIAL,
  defense_v1: BUILD_DEFENSE_TUTORIAL,
  formations_v1: USE_FORMATIONS_TUTORIAL,
};

export const TUTORIAL_LIST: ReadonlyArray<TutorialDef> = [
  PLAY_AUTHORING_TUTORIAL,
  BUILD_DEFENSE_TUTORIAL,
  USE_FORMATIONS_TUTORIAL,
];
