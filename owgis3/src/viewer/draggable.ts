/**
 * Lightweight drag + minimize helpers mimicking OWGIS 2 WindowPositions.js.
 */

const STORAGE_KEY = "owgis3.panelPositions";

type PanelPos = { left: number; top: number; minimized?: boolean };

/**
 * Read saved panel positions from localStorage.
 *
 * @returns id → position map
 */
function loadPositions(): Record<string, PanelPos> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, PanelPos>;
  } catch {
    return {};
  }
}

/**
 * Persist a panel position.
 *
 * @param id panel element id
 * @param pos left/top and optional minimized flag
 */
function savePosition(id: string, pos: PanelPos): void {
  const all = loadPositions();
  all[id] = pos;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Make an element draggable by its title bar (or the whole panel if no handle).
 *
 * @param panel floating window element
 * @param handle optional drag handle; defaults to `.win-title`
 */
export function makeDraggable(panel: HTMLElement, handle?: HTMLElement | null): void {
  const grip = handle ?? panel.querySelector<HTMLElement>(".win-title") ?? panel;
  const saved = loadPositions()[panel.id];
  if (saved) {
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
    // Do not restore minimized on load for any panel here — docked
    // Main/Calendars start open (OWGIS 2); tool panels are forced hidden later.
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  const onMove = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    const left = Math.max(0, origLeft + event.clientX - startX);
    const top = Math.max(0, origTop + event.clientY - startY);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const onUp = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    grip.releasePointerCapture(event.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    savePosition(panel.id, {
      left: panel.offsetLeft,
      top: panel.offsetTop,
      minimized: panel.classList.contains("minimized"),
    });
  };

  grip.addEventListener("pointerdown", (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest("button, a, select, input, label")) {
      return;
    }
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    origLeft = panel.offsetLeft;
    origTop = panel.offsetTop;
    panel.style.zIndex = String(1015);
    grip.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

/**
 * Wire minimize / restore controls for a floating window.
 *
 * @param panel floating window
 * @param dock minimized-windows container
 * @param tabLabel short label for the bottom restore tab
 * @param options.useDock when false, close/minimize only hides the panel
 *   (OWGIS 2 tool panels are restored from the top toolbar, not the bottom dock)
 */
export function wireMinimize(
  panel: HTMLElement,
  dock: HTMLElement,
  tabLabel: string,
  options: { useDock?: boolean } = {},
): void {
  const useDock = options.useDock !== false;
  const minBtn = panel.querySelector<HTMLButtonElement>(".win-min");
  const closeBtn = panel.querySelector<HTMLButtonElement>(".win-close");

  const ensureTab = (): HTMLButtonElement | null => {
    if (!useDock) {
      return null;
    }
    let tab = dock.querySelector<HTMLButtonElement>(`[data-restore="${panel.id}"]`);
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button";
      tab.className = "minimizedWindow";
      tab.dataset.restore = panel.id;
      tab.textContent = tabLabel;
      tab.addEventListener("click", () => {
        panel.classList.remove("minimized", "hidden");
        tab!.classList.add("hidden");
        savePosition(panel.id, {
          left: panel.offsetLeft,
          top: panel.offsetTop,
          minimized: false,
        });
      });
      dock.appendChild(tab);
    }
    return tab;
  };

  const minimize = (): void => {
    panel.classList.add("minimized");
    panel.classList.add("hidden");
    const tab = ensureTab();
    tab?.classList.remove("hidden");
    savePosition(panel.id, {
      left: panel.offsetLeft,
      top: panel.offsetTop,
      minimized: true,
    });
    document.dispatchEvent(
      new CustomEvent("owgis3:panel-hidden", { detail: { id: panel.id } }),
    );
  };

  minBtn?.addEventListener("click", minimize);
  closeBtn?.addEventListener("click", () => {
    panel.classList.add("hidden");
    panel.classList.add("minimized");
    if (useDock) {
      const tab = ensureTab();
      tab?.classList.remove("hidden");
      savePosition(panel.id, {
        left: panel.offsetLeft,
        top: panel.offsetTop,
        minimized: true,
      });
    }
    document.dispatchEvent(
      new CustomEvent("owgis3:panel-hidden", { detail: { id: panel.id } }),
    );
  });

  // Tool panels (no dock) always start hidden. Main Layers + Calendars start
  // open by default (OWGIS 2); only position is restored from localStorage.
  if (!useDock) {
    panel.classList.add("hidden");
    panel.classList.add("minimized");
  } else {
    panel.classList.remove("hidden", "minimized");
    const tab = dock.querySelector<HTMLButtonElement>(`[data-restore="${panel.id}"]`);
    tab?.classList.add("hidden");
    if (loadPositions()[panel.id]?.minimized) {
      savePosition(panel.id, {
        left: panel.offsetLeft,
        top: panel.offsetTop,
        minimized: false,
      });
    }
  }
}

/** Panel ids that restore from the bottom dock (OWGIS 2 MinimizeWindows.jsp). */
const DOCKED_PANEL_IDS = new Set([
  "mainMenuParent",
  "optionalMenuParent",
  "CalendarsAndStopContainer",
]);

/**
 * Enable drag + minimize for every `.draggableWindow` / `.transDraggableWindow` under root.
 *
 * @param root viewer root
 * @param options.mobile when true, skip drag/dock — panels open as mobile sheets
 */
export function initFloatingWindows(
  root: HTMLElement,
  options: { mobile?: boolean } = {},
): void {
  const mobile = options.mobile === true;
  const dock = root.querySelector<HTMLElement>("#minimizedWindowsContainer");
  if (!dock) {
    return;
  }
  // Drop stale restore tabs (e.g. old Palettes/Elevation pills on the colorbar).
  dock.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((tab) => {
    if (!DOCKED_PANEL_IDS.has(tab.dataset.restore ?? "")) {
      tab.remove();
    }
  });
  root.querySelectorAll<HTMLElement>(".draggableWindow, .transDraggableWindow").forEach((panel) => {
    if (!panel.id) {
      return;
    }
    if (mobile) {
      panel.classList.add("hidden", "minimized");
      panel.style.left = "";
      panel.style.top = "";
      // Close still hides; restore is via Tools / Layers header buttons.
      panel.querySelector<HTMLButtonElement>(".win-close")?.addEventListener("click", () => {
        panel.classList.add("hidden", "minimized");
        document.body.classList.remove("mob-panel-open", "mob-layers-open");
        document.querySelector("#mob-backdrop")?.classList.add("hidden");
      });
      panel.querySelector<HTMLButtonElement>(".win-min")?.classList.add("hidden");
      return;
    }
    makeDraggable(panel);
    const label = panel.dataset.tabLabel ?? panel.id;
    const useDock = DOCKED_PANEL_IDS.has(panel.id);
    wireMinimize(panel, dock, label, { useDock });
  });
}
