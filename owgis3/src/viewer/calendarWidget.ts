/**
 * Lightweight inline month calendar mimicking OWGIS 2 jQuery UI datepickers.
 */

export type CalendarSelectFn = (isoDate: string) => void;

export interface CalendarOptions {
  /** ISO dates yyyy-MM-dd that are selectable */
  availableDates: Set<string>;
  /** Initially selected day */
  selected?: string;
  /** Called when the user picks a day */
  onSelect?: CalendarSelectFn;
  /** Minimum selectable ISO date */
  minDate?: string;
  /** Maximum selectable ISO date */
  maxDate?: string;
}

/**
 * Parse yyyy-MM-dd as a UTC calendar day.
 *
 * @param iso ISO date
 * @returns Date at UTC midnight
 */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date as yyyy-MM-dd in UTC.
 *
 * @param date date
 * @returns ISO date string
 */
function formatIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Inline month calendar widget (OWGIS 2 start/end calendar look).
 */
export class MonthCalendar {
  private readonly root: HTMLElement;
  private readonly available: Set<string>;
  private readonly onSelect?: CalendarSelectFn;
  private readonly minDate?: string;
  private readonly maxDate?: string;
  private viewYear: number;
  private viewMonth: number;
  private selected: string;

  /**
   * @param root host element
   * @param opts calendar options
   */
  constructor(root: HTMLElement, opts: CalendarOptions) {
    this.root = root;
    this.available = opts.availableDates;
    this.onSelect = opts.onSelect;
    this.minDate = opts.minDate;
    this.maxDate = opts.maxDate;
    const initial = opts.selected
      ?? [...opts.availableDates].sort()[0]
      ?? formatIso(new Date());
    this.selected = initial;
    const d = parseIso(initial);
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.render();
  }

  /** @returns selected ISO date */
  getDate(): string {
    return this.selected;
  }

  /**
   * Programmatically set the selected day and visible month.
   *
   * @param iso yyyy-MM-dd
   * @param fire whether to invoke onSelect
   */
  setDate(iso: string, fire = false): void {
    this.selected = iso;
    const d = parseIso(iso);
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.render();
    if (fire) {
      this.onSelect?.(iso);
    }
  }

  /**
   * Re-render the month grid.
   */
  private render(): void {
    const first = new Date(Date.UTC(this.viewYear, this.viewMonth, 1));
    const startDow = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(this.viewYear, this.viewMonth + 1, 0)).getUTCDate();

    const cells: string[] = [];
    for (let i = 0; i < startDow; i++) {
      cells.push(`<td class="ui-datepicker-other-month">&nbsp;</td>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const enabled = this.isEnabled(iso);
      const selected = iso === this.selected;
      const classes = [
        "ui-datepicker-day",
        enabled ? "" : "ui-datepicker-unselectable ui-state-disabled",
        selected ? "ui-datepicker-current-day" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        `<td class="${classes}" data-iso="${iso}"><a href="#" class="ui-state-default${selected ? " ui-state-active" : ""}">${day}</a></td>`,
      );
    }
    while (cells.length % 7 !== 0) {
      cells.push(`<td class="ui-datepicker-other-month">&nbsp;</td>`);
    }

    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    }

    this.root.innerHTML = `
      <div class="ui-datepicker ui-widget ui-widget-content ui-helper-clearfix ui-corner-all">
        <div class="ui-datepicker-header ui-widget-header ui-helper-clearfix ui-corner-all">
          <a class="ui-datepicker-prev ui-corner-all" href="#" data-nav="-1" title="Prev">&#9664;</a>
          <a class="ui-datepicker-next ui-corner-all" href="#" data-nav="1" title="Next">&#9654;</a>
          <div class="ui-datepicker-title">
            <span class="ui-datepicker-month">${MONTH_NAMES[this.viewMonth]}</span>
            <span class="ui-datepicker-year">${this.viewYear}</span>
          </div>
        </div>
        <table class="ui-datepicker-calendar">
          <thead><tr>${DOW.map((d) => `<th><span>${d}</span></th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`;

    this.root.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => {
      a.addEventListener("click", (event) => {
        event.preventDefault();
        const delta = Number(a.dataset.nav);
        this.viewMonth += delta;
        if (this.viewMonth < 0) {
          this.viewMonth = 11;
          this.viewYear -= 1;
        } else if (this.viewMonth > 11) {
          this.viewMonth = 0;
          this.viewYear += 1;
        }
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLTableCellElement>("td[data-iso]").forEach((td) => {
      td.addEventListener("click", (event) => {
        event.preventDefault();
        if (td.classList.contains("ui-state-disabled")) {
          return;
        }
        const iso = td.dataset.iso;
        if (!iso) {
          return;
        }
        this.selected = iso;
        this.render();
        this.onSelect?.(iso);
      });
    });
  }

  /**
   * Whether a day can be selected.
   *
   * @param iso yyyy-MM-dd
   * @returns true if enabled
   */
  private isEnabled(iso: string): boolean {
    if (this.available.size > 0 && !this.available.has(iso)) {
      return false;
    }
    if (this.minDate && iso < this.minDate) {
      return false;
    }
    if (this.maxDate && iso > this.maxDate) {
      return false;
    }
    return true;
  }
}

/**
 * Build a Set of available ISO dates from ncWMS datesWithData.
 *
 * @param datesWithData nested year → monthIndex → days
 * @returns set of yyyy-MM-dd
 */
export function availableDateSet(
  datesWithData: Record<string, Record<string, number[]>> | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!datesWithData) {
    return out;
  }
  for (const [year, months] of Object.entries(datesWithData)) {
    for (const [month, days] of Object.entries(months)) {
      const mm = String(Number(month) + 1).padStart(2, "0");
      for (const day of days) {
        out.add(`${year}-${mm}-${String(day).padStart(2, "0")}`);
      }
    }
  }
  return out;
}
