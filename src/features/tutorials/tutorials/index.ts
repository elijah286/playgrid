import type { TutorialDef, TutorialId } from "../engine/types";
import { PLAY_AUTHORING_TUTORIAL } from "./playAuthoring";
import { BUILD_DEFENSE_TUTORIAL } from "./buildDefense";
import { USE_FORMATIONS_TUTORIAL } from "./useFormations";
import { CREATE_PRACTICE_PLAN_TUTORIAL } from "./createPracticePlan";
import { USE_GAME_MODE_TUTORIAL } from "./useGameMode";
import { PRINT_PLAYS_TUTORIAL } from "./printPlays";

export const TUTORIALS: Record<TutorialId, TutorialDef> = {
  play_authoring_v1: PLAY_AUTHORING_TUTORIAL,
  defense_v1: BUILD_DEFENSE_TUTORIAL,
  formations_v1: USE_FORMATIONS_TUTORIAL,
  practice_plan_v1: CREATE_PRACTICE_PLAN_TUTORIAL,
  game_mode_v1: USE_GAME_MODE_TUTORIAL,
  print_v1: PRINT_PLAYS_TUTORIAL,
};

export const TUTORIAL_LIST: ReadonlyArray<TutorialDef> = [
  PLAY_AUTHORING_TUTORIAL,
  BUILD_DEFENSE_TUTORIAL,
  USE_FORMATIONS_TUTORIAL,
  CREATE_PRACTICE_PLAN_TUTORIAL,
  USE_GAME_MODE_TUTORIAL,
  PRINT_PLAYS_TUTORIAL,
];
