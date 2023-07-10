import { Storage } from "@plasmohq/storage";

import { initial } from "./ythd-setup";
import { prepareToChangeQualityOnDesktop } from "~cs-helpers/desktop/content-script-desktop";
import { prepareToChangeQualityOnMobile } from "~cs-helpers/mobile/content-script-mobile";
import type {
  EnhancedBitrateFpsPreferences,
  EnhancedBitratePreferences,
  QualityFpsPreferences,
  VideoFPS
} from "~types";


const storageLocal = new Storage({ area: "local" });

export const OBSERVER_OPTIONS: MutationObserverInit = Object.freeze({ childList: true, subtree: true });
window.ythdLastUserQualities = { ...initial.qualities };
export const IS_DESKTOP = !navigator.userAgent.includes("Android");

export async function getStorage<T>({
  area,
  key,
  fallback,
  updateWindowKey
}: {
  area: "local" | "sync";
  key: string;
  fallback: T;
  updateWindowKey: string;
}): Promise<T> {
  const storage = new Storage({ area });
  let value: T;
  try {
    value = (await storage.get<T>(key)) ?? fallback;
  } catch {
    value = fallback;
  }
  if (typeof window[updateWindowKey] !== "object") {
    window[updateWindowKey] = value;
  } else {
    window[updateWindowKey] = { ...fallback, ...value };
  }
  return value;
}

export async function getIsExtensionEnabled(): Promise<boolean> {
  return getStorage({
    area: "local",
    key: "isExtensionEnabled",
    fallback: initial.isExtensionEnabled,
    updateWindowKey: "ythdExtEnabled"
  });
}

export function getI18n(id: string, backup = ""): string {
  return (id && chrome.i18n.getMessage(id)) || backup;
}

export enum SELECTORS {
  // Global
  title = "title",
  video = "video",
  // Desktop
  buttonSettings = ".ytp-settings-button",
  pathSizeToggle = `path[d*="m 28,"], path[d*="m 26,"]`,
  optionQuality = ".ytp-settings-menu[data-layer] .ytp-menuitem:last-child",
  menuOption = ".ytp-settings-menu[data-layer] .ytp-menuitem",
  menuOptionContent = ".ytp-menuitem-content",
  panelHeaderBack = ".ytp-panel-header button",
  player = ".html5-video-player:not(#inline-preview-player)",
  relatedVideos = "#secondary-inner",
  donationSection = ".ythd-donation-section",
  // Premium
  logo = "ytd-logo",
  labelPremium = ".ytp-premium-label",
  // Mobile
  mobileQualityDropdown = "select[id^=player-quality-dropdown]",
  mobileQualityDropdownWrapper = ".player-quality-settings",
  mobileMenuButton = "button.player-settings-icon",
  mobileOkButton = ".dialog-buttons [class*=material-button-button]"
}

export function getVisibleElement<T extends HTMLElement>(elementName: SELECTORS): T {
  const elements = [...document.querySelectorAll(elementName)] as T[];
  return elements.find(isElementVisible);
}

export async function getElementByMutationObserver(selector: SELECTORS, isVisible = true): Promise<HTMLElement> {
  return new Promise(resolve => {
    new MutationObserver((_, observer) => {
      const element = isVisible ? getVisibleElement(selector) : document.querySelector<HTMLElement>(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    }).observe(document, OBSERVER_OPTIONS);
  });
}

export function addStorageListener(): void {
  const prepareFunc =
    location.hostname === "m.youtube.com" ? prepareToChangeQualityOnMobile : prepareToChangeQualityOnDesktop;
  storageLocal.watch({
    async isExtensionEnabled({ newValue: isExtEnabled }: { newValue: boolean }) {
      window.ythdExtEnabled = isExtEnabled;
      const elVideo = getVisibleElement<HTMLVideoElement>(SELECTORS.video);
      if (!elVideo) {
        return;
      }
      if (!isExtEnabled) {
        elVideo.removeEventListener("canplay", prepareFunc);
        return;
      }
      await prepareFunc();
    },
    async qualities({ newValue: qualities }: { newValue: QualityFpsPreferences }) {
      window.ythdLastQualityClicked = null;
      window.ythdLastUserQualities = qualities;
      await prepareFunc();
    },
    async isEnhancedBitrates({ newValue: isEnhancedBitrates }: { newValue: EnhancedBitratePreferences }) {
      window.ythdLastUserEnhancedBitrates = isEnhancedBitrates;
      await prepareToChangeQualityOnDesktop();
    }
  });
}

export async function addGlobalEventListener(addTemporaryBodyListener: () => void): Promise<MutationObserver> {
  // Fires when navigating to another page
  const elTitle =
    document.documentElement.querySelector(SELECTORS.title) ||
    (await getElementByMutationObserver(SELECTORS.title, false));
  const observer = new MutationObserver(addTemporaryBodyListener);
  observer.observe(elTitle, OBSERVER_OPTIONS);
  return observer;
}

function isElementVisible(element: HTMLElement): boolean {
  return element?.offsetWidth > 0 && element?.offsetHeight > 0;
}

export function getFpsFromRange(
  qualities: QualityFpsPreferences | EnhancedBitrateFpsPreferences,
  fpsToCheck: VideoFPS
): VideoFPS {
  const fpsList = Object.keys(qualities)
    .map(parseInt)
    .sort((a, b) => b - a) as VideoFPS[];
  return fpsList.find(fps => fpsToCheck <= fps) || fpsList.at(-1);
}

export async function getPreferredQualities(): Promise<QualityFpsPreferences> {
  return getStorage({
    area: "local",
    key: "qualities",
    fallback: initial.qualities,
    updateWindowKey: "ythdLastUserQualities"
  });
}
