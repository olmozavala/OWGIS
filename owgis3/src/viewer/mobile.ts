/**
 * Mobile viewer mode — mirrors OWGIS 2 (`?mobile=true` / UA / narrow width).
 * Desktop keeps floating windows; mobile uses a header + side sheets.
 */

const MOBILE_BREAKPOINT_PX = 750;

/** Active chrome instance for delegated root clicks (HMR-safe). */
let activeMobileChrome: MobileChrome | null = null;

/**
 * Whether the URL forces mobile on/off (`?mobile=true|false`).
 *
 * @returns forced boolean, or null when auto
 */
export function forcedMobileParam(): boolean | null {
  const param = new URLSearchParams(window.location.search).get("mobile");
  if (param === "true" || param === "1") {
    return true;
  }
  if (param === "false" || param === "0") {
    return false;
  }
  return null;
}

/**
 * Decide whether the viewer should run in mobile chrome.
 * Honors `?mobile=true|false` like OWGIS 2; otherwise UA or width ≤ 750.
 *
 * @returns true when mobile layout should be used
 */
export function resolveMobileMode(): boolean {
  const forced = forcedMobileParam();
  if (forced !== null) {
    return forced;
  }
  const ua = navigator.userAgent;
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(
      ua,
    )
  ) {
    return true;
  }
  return window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

/**
 * Apply body class and tighten the viewport meta for touch (OWGIS 2 Mobile.jsp).
 *
 * @param mobile whether mobile mode is active
 */
export function applyMobileDocument(mobile: boolean): void {
  document.body.classList.toggle("viewer-mobile", mobile);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && mobile) {
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
  }
}

/**
 * When the viewport crosses the mobile breakpoint, reload so chrome matches
 * OWGIS 2 (desktop floating windows vs Tools/Layers sheets). Skipped when
 * `?mobile=` forces a mode.
 *
 * @param currentMobile mode used for this page load
 */
export function watchMobileBreakpoint(currentMobile: boolean): void {
  if (forcedMobileParam() !== null) {
    return;
  }
  let lastMobile = currentMobile;
  let timer = 0;
  const check = (): void => {
    const next = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (next === lastMobile) {
      return;
    }
    lastMobile = next;
    window.location.reload();
  };
  window.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 250);
  });
  window.addEventListener("orientationchange", () => {
    window.setTimeout(check, 350);
  });
}

export type MobileChromeOptions = {
  /** Called after sheets open/close so the map can `updateSize`. */
  onLayoutChange?: () => void;
  /** Whether the layer has calendar dates. */
  hasCalendars?: () => boolean;
};

/**
 * Tools / Layers side-sheet controller for the mobile viewer.
 */
export class MobileChrome {
  private readonly root: HTMLElement;
  private readonly opts: MobileChromeOptions;
  private backdrop: HTMLElement | null = null;

  /**
   * @param root viewer shell (`#app`)
   * @param opts layout callbacks
   */
  constructor(root: HTMLElement, opts: MobileChromeOptions = {}) {
    this.root = root;
    this.opts = opts;
  }

  /**
   * Inject mobile header, backdrop, and tools sheet into the shell.
   */
  mount(): void {
    activeMobileChrome = this;

    this.root.querySelector("#mob-header")?.remove();
    this.root.querySelector("#mob-backdrop")?.remove();
    this.root.querySelector("#mob-sheet-tools")?.remove();
    this.root.querySelector("#mob-layers-chrome")?.remove();

    const header = document.createElement("header");
    header.id = "mob-header";
    header.className = "mob-header";
    header.innerHTML = `
      <button type="button" id="btn-mob-tools" class="mob-header-btn" aria-controls="mob-sheet-tools">
        Tools
      </button>
      <span class="mob-header-title" id="mobHeaderTitle"></span>
      <button type="button" id="btn-mob-layers" class="mob-header-btn" aria-controls="mob-sheet-layers">
        Layers
      </button>
    `;

    const backdrop = document.createElement("div");
    backdrop.id = "mob-backdrop";
    backdrop.className = "mob-backdrop hidden";
    backdrop.setAttribute("aria-hidden", "true");

    const toolsSheet = document.createElement("aside");
    toolsSheet.id = "mob-sheet-tools";
    toolsSheet.className = "mob-sheet mob-sheet-left";
    toolsSheet.setAttribute("aria-hidden", "true");
    toolsSheet.innerHTML = `
      <div class="mob-sheet-head">
        <h2>Tools</h2>
        <button type="button" class="mob-sheet-close" data-mob-close title="Close" aria-label="Close">✕</button>
      </div>
      <div class="mob-sheet-body" id="mob-tools-body"></div>
    `;

    const layersChrome = document.createElement("div");
    layersChrome.id = "mob-layers-chrome";
    layersChrome.className = "mob-layers-chrome";
    layersChrome.innerHTML = `
      <div class="mob-sheet-head">
        <h2>Layers</h2>
        <button type="button" class="mob-sheet-close" data-mob-close title="Close" aria-label="Close">✕</button>
      </div>
    `;

    this.root.prepend(header);
    this.root.append(backdrop, toolsSheet, layersChrome);
    this.backdrop = backdrop;
    this.bindChromeEvents();
  }

  /**
   * Wire Tools / Layers / backdrop / close via capture (once per page).
   */
  private bindChromeEvents(): void {
    const win = window as unknown as { __owgisMobClick?: boolean; __owgisMobEsc?: boolean };
    if (!win.__owgisMobClick) {
      win.__owgisMobClick = true;
      document.addEventListener(
        "click",
        (event: MouseEvent) => {
          const chrome = activeMobileChrome;
          if (!chrome) {
            return;
          }
          const target = event.target;
          if (!(target instanceof Element) || !chrome.root.contains(target)) {
            return;
          }
          if (target.closest("#btn-mob-tools")) {
            event.preventDefault();
            event.stopPropagation();
            chrome.openTools();
            return;
          }
          if (target.closest("#btn-mob-layers")) {
            event.preventDefault();
            event.stopPropagation();
            chrome.openLayers();
            return;
          }
          if (target.closest("[data-mob-close]") || target.closest("#mob-backdrop")) {
            event.preventDefault();
            event.stopPropagation();
            chrome.closeAll();
          }
        },
        true,
      );
    }

    if (!win.__owgisMobEsc) {
      win.__owgisMobEsc = true;
      document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (
          event.key === "Escape"
          && document.body.classList.contains("viewer-mobile")
        ) {
          activeMobileChrome?.closeAll();
        }
      });
    }
  }

  /**
   * Sync the short title in the mobile header.
   *
   * @param text layer label (plain text)
   */
  setTitle(text: string): void {
    const el = this.root.querySelector("#mobHeaderTitle");
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * Host element for basemap / opacity / tool links inside the Tools sheet.
   *
   * @returns tools body element
   */
  toolsBody(): HTMLElement | null {
    return this.root.querySelector("#mob-tools-body");
  }

  /**
   * Open the left Tools sheet.
   */
  openTools(): void {
    this.hideAllPanels();
    document.body.classList.remove("mob-layers-open", "mob-panel-open");
    document.body.classList.add("mob-tools-open");
    this.setSheetOpen("mob-sheet-tools", true);
    this.showBackdrop(true);
    this.opts.onLayoutChange?.();
  }

  /**
   * Open the right Layers sheet (main / optional menus + calendars).
   */
  openLayers(): void {
    document.body.classList.remove("mob-tools-open", "mob-panel-open");
    document.body.classList.add("mob-layers-open");
    this.setSheetOpen("mob-sheet-tools", false);
    this.hideToolPanels();
    this.showPanel("mainMenuParent", true);
    this.showPanel("optionalMenuParent", true);
    const showCal = this.opts.hasCalendars?.() ?? true;
    this.showPanel("CalendarsAndStopContainer", showCal);
    this.showBackdrop(true);
    this.opts.onLayoutChange?.();
  }

  /**
   * Open a single tool panel as a full-height sheet (from the Tools list).
   *
   * @param panelId DOM id of the floating window
   */
  openPanelSheet(panelId: string): void {
    document.body.classList.remove("mob-tools-open", "mob-layers-open");
    document.body.classList.add("mob-panel-open");
    this.setSheetOpen("mob-sheet-tools", false);
    this.hideAllPanels();
    this.showPanel(panelId, true);
    this.showBackdrop(true);
    this.opts.onLayoutChange?.();
  }

  /**
   * Close every mobile sheet and hide floating panels.
   */
  closeAll(): void {
    document.body.classList.remove(
      "mob-tools-open",
      "mob-layers-open",
      "mob-panel-open",
    );
    this.setSheetOpen("mob-sheet-tools", false);
    this.hideAllPanels();
    this.showBackdrop(false);
    this.opts.onLayoutChange?.();
  }

  /**
   * @param id sheet element id
   * @param open whether the sheet is visible
   */
  private setSheetOpen(id: string, open: boolean): void {
    const sheet = this.root.querySelector(`#${id}`);
    if (!sheet) {
      return;
    }
    sheet.classList.toggle("open", open);
    sheet.setAttribute("aria-hidden", open ? "false" : "true");
  }

  /**
   * @param show whether the dimmed backdrop is visible
   */
  private showBackdrop(show: boolean): void {
    if (!this.backdrop) {
      this.backdrop = this.root.querySelector("#mob-backdrop");
    }
    if (!this.backdrop) {
      return;
    }
    this.backdrop.classList.toggle("hidden", !show);
    this.backdrop.setAttribute("aria-hidden", show ? "false" : "true");
  }

  /**
   * @param id panel element id
   * @param show visible when true
   */
  private showPanel(id: string, show: boolean): void {
    const panel = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!panel) {
      return;
    }
    panel.classList.toggle("hidden", !show);
    panel.classList.toggle("minimized", !show);
    if (show) {
      panel.style.left = "";
      panel.style.top = "";
    }
  }

  /** Hide every draggable / translucent window. */
  private hideAllPanels(): void {
    this.root
      .querySelectorAll<HTMLElement>(".draggableWindow, .transDraggableWindow")
      .forEach((panel) => {
        panel.classList.add("hidden", "minimized");
      });
  }

  /** Hide tool panels but leave layer panels alone. */
  private hideToolPanels(): void {
    const keep = new Set([
      "mainMenuParent",
      "optionalMenuParent",
      "CalendarsAndStopContainer",
    ]);
    this.root
      .querySelectorAll<HTMLElement>(".draggableWindow, .transDraggableWindow")
      .forEach((panel) => {
        if (!keep.has(panel.id)) {
          panel.classList.add("hidden", "minimized");
        }
      });
  }
}
