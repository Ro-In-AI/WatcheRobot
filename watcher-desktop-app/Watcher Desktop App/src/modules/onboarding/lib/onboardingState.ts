const ONBOARDING_COMPLETED_KEY = "watcher:onboarding-completed:v1";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.error("读取 onboarding 存储失败", error);
    return null;
  }
}

export function getHasCompletedOnboarding() {
  return getStorage()?.getItem(ONBOARDING_COMPLETED_KEY) === "true";
}

export function setHasCompletedOnboarding(value: boolean) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (value) {
    storage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    return;
  }

  storage.removeItem(ONBOARDING_COMPLETED_KEY);
}
