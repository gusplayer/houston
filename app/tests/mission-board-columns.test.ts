import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildMissionBoardColumns } from "../src/components/mission-board-columns.ts";

describe("mission board columns", () => {
  it("includes Up next and wires per-column onAdd handlers", () => {
    const openNewMission = () => {};
    const openQueueTask = () => {};
    const columns = buildMissionBoardColumns(
      {
        upNext: "Up next",
        running: "Running",
        needsYou: "Needs you",
        done: "Done",
        newMission: "New mission",
        queueTask: "Queue task",
      },
      openNewMission,
      openQueueTask,
    );

    deepStrictEqual(
      columns.map((column) => ({
        id: column.id,
        label: column.label,
        statuses: column.statuses,
      })),
      [
        { id: "queued", label: "Up next", statuses: ["queued"] },
        { id: "running", label: "Running", statuses: ["running"] },
        { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
        { id: "done", label: "Done", statuses: ["done", "cancelled"] },
      ],
    );
    // queued column → onQueueTask, running column → onNewMission, others no add.
    strictEqual(columns[0].onAdd, openQueueTask);
    strictEqual(columns[0].addLabel, "Queue task");
    strictEqual(columns[1].onAdd, openNewMission);
    strictEqual(columns[1].addLabel, "New mission");
    strictEqual(columns[2].onAdd, undefined);
    strictEqual(columns[3].onAdd, undefined);
  });

  it("hides the queued onAdd when no handler is provided", () => {
    const columns = buildMissionBoardColumns(
      {
        upNext: "Up next",
        running: "Running",
        needsYou: "Needs you",
        done: "Done",
        newMission: "New mission",
        queueTask: "Queue task",
      },
      () => {},
    );
    strictEqual(columns[0].onAdd, undefined);
    strictEqual(columns[0].addLabel, undefined);
  });
});
