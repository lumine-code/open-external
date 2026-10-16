const { CompositeDisposable } = require("lumine");
describe("External path command availability", () => {
  let main, target, leases, snapshot;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("open-external")).mainModule;
    target = document.createElement("div");
    target.className = "tree-view";
    lumine.workspace.getElement().appendChild(target);
    leases = new CompositeDisposable();
    snapshot = { count: 0 };
    leases.add(
      main.consumeTreeViewSelection({
        getSelectionSnapshot: () => snapshot,
        selectedPaths() {
          throw Error("query initialized selection");
        },
      }),
    );
  });
  afterEach(() => {
    leases.dispose();
    target.remove();
  });
  it("restores the preceding live selection provider when the latest lease ends", () => {
    const first = { getSelectionSnapshot: () => ({ count: 1 }), selectedPaths: () => [__filename] };
    const second = { getSelectionSnapshot: () => ({ count: 0 }), selectedPaths: () => [] };
    leases.add(main.consumeTreeViewSelection(first));
    const latest = main.consumeTreeViewSelection(second);
    leases.add(latest);
    expect(lumine.commands.canDispatch(target, "open-external:open")).toBe(false);
    latest.dispose();
    expect(lumine.commands.canDispatch(target, "open-external:open")).toBe(true);
    expect(main.pathsForEvent({ target })).toEqual([__filename]);
  });

  it("requires an actual cached target path while preserving the global toggle", () => {
    expect(lumine.commands.canDispatch(lumine.workspace.getElement(), "open-external:open")).toBe(
      false,
    );
    expect(lumine.commands.canDispatch(target, "open-external:show")).toBe(false);
    snapshot = { count: 1 };
    expect(lumine.commands.canDispatch(target, "open-external:show")).toBe(true);
    expect(lumine.commands.canDispatch(target, "open-external:toggle")).toBe(true);
  });
});
