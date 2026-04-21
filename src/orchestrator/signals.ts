export const SIGNAL_DIR = ".autodev/signals";

export const SIGNAL = {
  SA_DONE: `${SIGNAL_DIR}/sa_done`,
  DEV_DONE: `${SIGNAL_DIR}/dev_done`,
  QA_DONE_CLEAN: `${SIGNAL_DIR}/qa_done_clean`,
  QA_DONE_BUGS: `${SIGNAL_DIR}/qa_done_bugs`,
} as const;

export const ALL_SIGNALS: string[] = Object.values(SIGNAL);

export const REQUIREMENT_FILE = "REQ/requirement.md";
export const SA_PLAN = "SA/plan.md";
export const SA_TASK = "SA/task.md";
export const DEV_DONE_MD = "DEV/dev.md";
export const DEV_LOG_MD = "DEV/log.md";

export const qaIterDir = (iter: number): string => `QA/iter${iter}`;
