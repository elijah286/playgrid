import type { TutorialDef, TutorialId } from "../engine/types";
import { PLAY_AUTHORING_TUTORIAL } from "./playAuthoring";

export const TUTORIALS: Record<TutorialId, TutorialDef> = {
  play_authoring_v1: PLAY_AUTHORING_TUTORIAL,
};

export const TUTORIAL_LIST: ReadonlyArray<TutorialDef> = [PLAY_AUTHORING_TUTORIAL];
