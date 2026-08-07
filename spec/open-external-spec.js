describe("open-external", () => {
  it("activates and deactivates cleanly", async () => {
    await atom.packages.activatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(true);
    await atom.packages.deactivatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(false);
  });

  describe("choosing what a command acts on", () => {
    let main;

    beforeEach(async () => {
      const pack = await atom.packages.activatePackage("open-external");
      main = pack.mainModule;
      main.consumeTreeViewSelection({ selectedPaths: () => ["/selected/one", "/selected/two"] });
    });

    afterEach(async () => {
      await atom.packages.deactivatePackage("open-external");
    });

    it("takes the tree view's selection when the dispatch came from there", () => {
      const row = document.createElement("li");
      const treeView = document.createElement("div");
      treeView.classList.add("tree-view");
      treeView.appendChild(row);

      expect(main.pathsForEvent({ target: row })).toEqual(["/selected/one", "/selected/two"]);
    });

    it("takes the active item everywhere else, including the application menu", async () => {
      await atom.workspace.open(__filename);
      expect(main.pathsForEvent({ target: atom.workspace.getElement() })).toEqual([__filename]);
    });

    it("says why it refused when there is no file to act on", () => {
      main.consumeTreeViewSelection({ selectedPaths: () => [] });
      const warnings = [];
      atom.notifications.onDidAddNotification((notification) => warnings.push(notification));

      main.runForEvent({ target: atom.workspace.getElement() }, "showInFolder");

      expect(warnings.length).toBe(1);
      expect(warnings[0].getType()).toBe("warning");
    });
  });

  describe("acting on a path that is not there", () => {
    const path = require("path");
    const missing = path.join(__dirname, "renamed-or-deleted-since.txt");
    let main, warnings, subscription;

    beforeEach(async () => {
      const pack = await atom.packages.activatePackage("open-external");
      main = pack.mainModule;
      warnings = [];
      // Disposed below: the callback reads `warnings` when it fires, so one
      // left attached would keep filling the next spec's array as well as
      // this one's, and every count here would be one too many.
      subscription = atom.notifications.onDidAddNotification((notification) =>
        warnings.push(notification),
      );
    });

    afterEach(async () => {
      subscription.dispose();
      await atom.packages.deactivatePackage("open-external");
    });

    it("says so rather than revealing nothing", async () => {
      await main.showInFolder(missing);

      expect(warnings.length).toBe(1);
      expect(warnings[0].getType()).toBe("warning");
      expect(warnings[0].getOptions().detail).toBe(missing);
    });

    it("says so rather than opening nothing", async () => {
      await main.openExternal(missing);

      expect(warnings.length).toBe(1);
      expect(warnings[0].getType()).toBe("warning");
    });

    it("stays quiet for a path that is there", async () => {
      expect(await main.confirmOnDisk(__filename, "show")).toBe(true);
      expect(warnings.length).toBe(0);
    });

    // A handler may serve paths that were never on this filesystem, so the
    // check has to come after it has had its turn, not before.
    it("leaves a handler that claimed the path alone", async () => {
      const shown = [];
      main.registerHandler({
        priority: 1,
        showInFolder: (filePath) => {
          shown.push(filePath);
          return true;
        },
      });

      await main.showInFolder("remote://never/on/disk");

      expect(shown).toEqual(["remote://never/on/disk"]);
      expect(warnings.length).toBe(0);
    });
  });

  describe("revealing the file a tab names", () => {
    let tab;

    beforeEach(async () => {
      await atom.packages.activatePackage("open-external");
      jasmine.attachToDOM(atom.workspace.getElement());

      // A tab of the real shape rather than the `tabs` package's: this is here
      // to pin the selector, and the package under test must not gain a
      // dependency to say so. It stays out of the document, because both
      // lookups below only walk parents and match selectors, while an attached
      // `atom-pane` would run a connected callback with no model behind it.
      const pane = document.createElement("atom-pane");
      pane.setAttribute("data-active-item-path", __filename);
      tab = document.createElement("li");
      tab.classList.add("tab", "active");
      pane.appendChild(tab);
    });

    afterEach(async () => {
      await atom.packages.deactivatePackage("open-external");
    });

    // A tab sits outside the view it names, and the application menu dispatches
    // at whatever holds focus, so neither surface can be a scope the commands
    // depend on. One workspace registration reaches every one of them.
    it("registers the commands on the workspace", () => {
      const names = atom.commands
        .findCommands({ target: atom.workspace.getElement() })
        .map((command) => command.name);

      expect(names).toContain("open-external:show");
      expect(names).toContain("open-external:open");
    });

    it("offers only revealing in the tab's context menu", () => {
      const labels = atom.contextMenu
        .templateForElement(tab)
        .filter((item) => item.visible !== false)
        .map((item) => item.label);

      expect(labels).toContain("Show in Folder");
      expect(labels).not.toContain("Open Externally");
    });

    it("offers the same in an editor's context menu", async () => {
      const editor = await atom.workspace.open(__filename);
      const labels = atom.contextMenu
        .templateForElement(atom.views.getView(editor))
        .filter((item) => item.visible !== false)
        .map((item) => item.label);

      expect(labels).toContain("Show in Folder");
    });
  });
});
