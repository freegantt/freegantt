import { describe, expect, it } from 'vitest';
import { GridPaneWidth } from './grid-pane-width.js';
import type { GridPaneWidthPorts } from './grid-pane-width.js';

/** A fake pane: holds the same two numbers `PaneLayout` would, and runs `commitWidth` the same
 *  apply/rollback shape `GanttShell#gridPaneWidthPorts` runs over `#proposeChange` — a veto vetoes,
 *  a survived change applies. `columnsWidth` stands in for the resolved columns' own right edge
 *  (`undefined` means a `flex` column names no edge, #139). */
function makePane(options: { width: number; minWidth?: number; columnsWidth?: number; veto?: boolean }): {
  pane: GridPaneWidthPorts;
  commits: Array<{ from: number; to: number }>;
  vetoing: { on: boolean };
  /** Mirrors `GanttShell`'s own `previewGridWidth` callback: it writes the pane's stored width
   *  directly, with no event and no veto. Lets a test paint a live preview before it commits, the
   *  same order a real drag runs in. */
  paintWidth: (px: number) => void;
} {
  let width = options.width;
  let minWidth = options.minWidth ?? 40;
  const vetoing = { on: options.veto ?? false };
  const commits: Array<{ from: number; to: number }> = [];
  const pane: GridPaneWidthPorts = {
    readWidth: () => width,
    readMinWidth: () => minWidth,
    writeMinWidth: (px) => {
      minWidth = px;
    },
    columnsEdge: () => options.columnsWidth,
    commitWidth: (px) => {
      const from = width;
      commits.push({ from, to: px });
      if (vetoing.on) return false;
      width = px;
      return true;
    },
  };
  return {
    pane,
    commits,
    vetoing,
    paintWidth: (px) => {
      width = px;
    },
  };
}

describe('GridPaneWidth (#252 S8-1)', () => {
  describe('the #127 floor', () => {
    it('setFloor lifts a width already narrower than the new floor', () => {
      const { pane } = makePane({ width: 100 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.setFloor(150);

      expect(gridPaneWidth.floor).toBe(150);
      expect(gridPaneWidth.width).toBe(150);
    });

    it('setFloor below the current width leaves the width alone', () => {
      const { pane, commits } = makePane({ width: 200 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.setFloor(100);

      expect(gridPaneWidth.width).toBe(200);
      expect(commits).toEqual([]);
    });

    it('a vetoed lift leaves the width exactly where it was', () => {
      const { pane } = makePane({ width: 100, veto: true });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.setFloor(150);

      expect(gridPaneWidth.floor).toBe(150);
      expect(gridPaneWidth.width).toBe(100);
    });

    it('an explicit width of 0 still collapses the pane on purpose — nothing floors resize()', () => {
      const { pane } = makePane({ width: 200, minWidth: 120 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize(0);

      expect(gridPaneWidth.width).toBe(0);
    });
  });

  describe('the #139 ceiling', () => {
    it('resize caps a px width at the columns’ own edge', () => {
      const { pane } = makePane({ width: 200, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize(900);

      expect(gridPaneWidth.width).toBe(360);
    });

    it('resize narrower than the columns’ edge is always legal', () => {
      const { pane } = makePane({ width: 200, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize(100);

      expect(gridPaneWidth.width).toBe(100);
    });

    it('a flex column names no edge, so resize keeps the width the consumer asked for', () => {
      const { pane } = makePane({ width: 200 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize(900);

      expect(gridPaneWidth.width).toBe(900);
    });
  });

  describe("'fitColumns' (#157)", () => {
    it("resize('fitColumns') sits the pane on the columns’ own edge", () => {
      const { pane } = makePane({ width: 200, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize('fitColumns');

      expect(gridPaneWidth.width).toBe(360);
    });

    it('resizeToColumns re-measures a fitColumns pane when the column set changes', () => {
      const { pane } = makePane({ width: 240, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, true);

      gridPaneWidth.resizeToColumns();

      expect(gridPaneWidth.width).toBe(360);
    });

    it('resizeToColumns leaves a non-fitColumns pane at its own ceiling, not the columns’ edge', () => {
      const { pane } = makePane({ width: 200, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resizeToColumns();

      expect(gridPaneWidth.width).toBe(200);
    });

    it('resizeToColumns is a no-op once the width already matches its target', () => {
      const { pane, commits } = makePane({ width: 360, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, true);

      gridPaneWidth.resizeToColumns();

      expect(commits).toEqual([]);
    });

    it('resizing to a px width live turns fitColumns tracking off', () => {
      const { pane } = makePane({ width: 360, columnsWidth: 480 });
      const gridPaneWidth = new GridPaneWidth(pane, true);

      gridPaneWidth.resize(300);
      gridPaneWidth.resizeToColumns();

      // A widened column set no longer moves a width the consumer asked for directly.
      expect(gridPaneWidth.width).toBe(300);
    });

    it('a flex column names no edge, so fitColumns keeps the authored width', () => {
      const { pane } = makePane({ width: 160 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize('fitColumns');

      expect(gridPaneWidth.width).toBe(160);
    });

    it("resize('fitColumns') commits nothing when the columns' own edge already matches the pane's width (#260)", () => {
      const { pane, commits } = makePane({ width: 360, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.resize('fitColumns');

      // No commit means no `beforeGridWidthChange`/`gridWidthChange` pair fires — a consumer is
      // never invited to veto a width that was never going to change.
      expect(commits).toEqual([]);
      expect(gridPaneWidth.width).toBe(360);
    });
  });

  describe('the splitter veto path', () => {
    it('previewDrag clamps to the floor under the ceiling, live, with no commit', () => {
      const { pane, commits } = makePane({ width: 200, minWidth: 120, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      expect(gridPaneWidth.previewDrag(0)).toBe(120);
      expect(gridPaneWidth.previewDrag(900)).toBe(360);
      expect(commits).toEqual([]);
    });

    it('commitDrag past the last column stops hard at its edge', () => {
      const { pane } = makePane({ width: 200, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      gridPaneWidth.commitDrag(900);

      expect(gridPaneWidth.width).toBe(360);
    });

    it('a completed drag ends fitColumns tracking — the consumer changed their mind (#157)', () => {
      const { pane } = makePane({ width: 360, columnsWidth: 360 });
      const gridPaneWidth = new GridPaneWidth(pane, true);

      gridPaneWidth.commitDrag(300);
      // A wider column set no longer moves a width the drag committed to directly.
      pane.columnsEdge = () => 480;
      gridPaneWidth.resizeToColumns();

      expect(gridPaneWidth.width).toBe(300);
    });

    it('a vetoed drag leaves fitColumns tracking standing (#157)', () => {
      const { pane, vetoing } = makePane({ width: 360, columnsWidth: 360, veto: true });
      const gridPaneWidth = new GridPaneWidth(pane, true);

      gridPaneWidth.commitDrag(300);
      // The drag never committed, so the pane still answers to its columns.
      vetoing.on = false;
      pane.columnsEdge = () => 480;
      gridPaneWidth.resizeToColumns();

      expect(gridPaneWidth.width).toBe(480);
    });

    it('a vetoed drag rolls back to whatever the live preview already painted, not the drag start', () => {
      // Pins the surprise probed against GanttShell at #252 S8-1: the preview writes straight
      // through with no veto (`previewDrag` is "no event, no commit"), so by the time a vetoed
      // commit rolls back, the pane's stored width already answers with the preview's own value,
      // not the drag's starting width (200 here). `paintWidth` stands in for the caller applying
      // the preview to `paneLayout.gridWidth`, the way `GanttShell`'s own callback does.
      const { pane, commits, paintWidth } = makePane({ width: 200, minWidth: 120, veto: true });
      const gridPaneWidth = new GridPaneWidth(pane, false);

      const previewed = gridPaneWidth.previewDrag(-500);
      paintWidth(previewed);
      gridPaneWidth.commitDrag(previewed);

      expect(previewed).toBe(120);
      // The veto's rollback target is the commit's own `from` — the preview it already painted,
      // not the drag's starting 200. A `from: 200` here would mean the veto restored the wrong
      // width.
      expect(commits).toEqual([{ from: 120, to: 120 }]);
      expect(gridPaneWidth.width).toBe(120);
    });
  });
});
