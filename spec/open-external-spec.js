describe("open-external", () => {
  it("activates and deactivates cleanly", async () => {
    await lumine.packages.activatePackage("open-external");
    expect(lumine.packages.isPackageActive("open-external")).toBe(true);
    await lumine.packages.deactivatePackage("open-external");
    expect(lumine.packages.isPackageActive("open-external")).toBe(false);
  });

  describe("path opener choices", () => {
    let main, pane;

    beforeEach(async () => {
      main = (await lumine.packages.activatePackage("open-external")).mainModule;
      pane = lumine.workspace.getActivePane();
      lumine.config.set("open-external.flag", false);
      lumine.config.set("open-external.list", ["js"]);
    });

    afterEach(async () => {
      await lumine.packages.deactivatePackage("open-external");
    });

    it("lists both external actions without launching either", () => {
      const open = spyOn(main, "openExternal");
      const show = spyOn(main, "showInFolder");

      expect(lumine.workspace.getAvailablePathOpeners(__filename)).toEqual([
        {
          id: "text-editor",
          label: "Text Editor",
          isDefault: true,
          destinations: ["current", "new-window", "detached-window"],
        },
        {
          id: "open-external",
          label: "Open Externally",
          isDefault: false,
          destinations: ["current"],
        },
        {
          id: "open-external:show",
          label: "Show in Folder",
          isDefault: false,
          destinations: ["current"],
        },
      ]);
      expect(open).not.toHaveBeenCalled();
      expect(show).not.toHaveBeenCalled();
      expect(pane.getItems()).toEqual([]);
    });

    it("keeps the external action first when it is the automatic default", async () => {
      const open = spyOn(main, "openExternal").and.resolveTo("");
      const show = spyOn(main, "showInFolder");
      lumine.config.set("open-external.flag", true);

      expect(lumine.workspace.getAvailablePathOpeners(__filename)).toEqual([
        {
          id: "open-external",
          label: "Open Externally",
          isDefault: true,
          destinations: ["current"],
        },
        {
          id: "open-external:show",
          label: "Show in Folder",
          isDefault: false,
          destinations: ["current"],
        },
        {
          id: "text-editor",
          label: "Text Editor",
          isDefault: false,
          destinations: ["current", "new-window", "detached-window"],
        },
      ]);
      await lumine.workspace.open(__filename);

      expect(open).toHaveBeenCalledOnceWith(__filename);
      expect(show).not.toHaveBeenCalled();
      expect(pane.getItems()).toEqual([]);
    });

    it("runs each explicitly selected action without opening a pane item", async () => {
      const open = spyOn(main, "openExternal").and.resolveTo("");
      const show = spyOn(main, "showInFolder").and.resolveTo("");

      await lumine.workspace.open(__filename, { opener: "open-external" });
      expect(open).toHaveBeenCalledOnceWith(__filename);
      expect(show).not.toHaveBeenCalled();

      await lumine.workspace.open(__filename, { opener: "open-external:show" });
      expect(show).toHaveBeenCalledOnceWith(__filename);
      expect(open).toHaveBeenCalledTimes(1);
      expect(pane.getItems()).toEqual([]);
    });

    it("offers both external actions on a folder while the project remains default", () => {
      const open = spyOn(main, "openExternal");
      const show = spyOn(main, "showInFolder");
      lumine.config.set("open-external.flag", true);
      // A folder name may have an extension on the automatic external list.
      // Its path kind, rather than that suffix, decides the default action.
      const folder = require("node:path").join(__dirname, "folder.js");
      expect(lumine.workspace.getAvailablePathOpeners(folder, { pathKind: "directory" })).toEqual([
        {
          id: "project-folder",
          label: "Project Folder",
          isDefault: true,
          destinations: ["current", "new-window"],
        },
        {
          id: "open-external",
          label: "Open Externally",
          isDefault: false,
          destinations: ["current"],
        },
        {
          id: "open-external:show",
          label: "Show in Folder",
          isDefault: false,
          destinations: ["current"],
        },
      ]);
      expect(open).not.toHaveBeenCalled();
      expect(show).not.toHaveBeenCalled();
    });

    it("removes both choices when the package deactivates", async () => {
      await lumine.packages.deactivatePackage("open-external");

      const ids = lumine.workspace.getAvailablePathOpeners(__filename).map(({ id }) => id);
      expect(ids).not.toContain("open-external");
      expect(ids).not.toContain("open-external:show");
    });
  });

  describe("choosing what a command acts on", () => {
    let main;

    beforeEach(async () => {
      const pack = await lumine.packages.activatePackage("open-external");
      main = pack.mainModule;
      main.consumeTreeViewSelection({ selectedPaths: () => ["/selected/one", "/selected/two"] });
    });

    afterEach(async () => {
      await lumine.packages.deactivatePackage("open-external");
    });

    it("takes the tree view's selection when the dispatch came from there", () => {
      const row = document.createElement("li");
      const treeView = document.createElement("div");
      treeView.classList.add("tree-view");
      treeView.appendChild(row);

      expect(main.pathsForEvent({ target: row })).toEqual(["/selected/one", "/selected/two"]);
    });

    it("takes the active item everywhere else, including the application menu", async () => {
      await lumine.workspace.open(__filename);
      expect(main.pathsForEvent({ target: lumine.workspace.getElement() })).toEqual([__filename]);
    });

    it("keeps the saved file view instead of a different active pane item", () => {
      spyOn(lumine.workspace, "getActivePaneItem").and.returnValue({
        getPath: () => "/unrelated/active.txt",
      });

      expect(
        main.pathsForEvent({
          target: lumine.workspace.getElement(),
          context: { item: { getPath: () => "/clicked/image.png" } },
        }),
      ).toEqual(["/clicked/image.png"]);
    });

    it("uses the clicked tab's item without falling back from an unsaved tab", () => {
      const tab = document.createElement("li");
      tab.className = "tab";
      tab.item = { getPath: () => "/clicked/document.txt" };
      spyOn(lumine.workspace, "getActivePaneItem").and.returnValue({
        getPath: () => "/unrelated/active.txt",
      });

      expect(main.pathsForEvent({ target: tab })).toEqual(["/clicked/document.txt"]);
      tab.item = { getPath: () => undefined };
      expect(main.pathsForEvent({ target: tab })).toEqual([]);
    });

    it("says why it refused when the active file is unsaved", () => {
      main.consumeTreeViewSelection({ selectedPaths: () => [] });
      spyOn(lumine.workspace, "getActivePaneItem").and.returnValue({ getPath: () => undefined });
      spyOn(lumine.notifications, "addWarning");

      main.runForEvent({ target: lumine.workspace.getElement() }, "showInFolder");

      expect(lumine.notifications.addWarning).toHaveBeenCalled();
    });

    it("stays quiet when there is no active item", () => {
      spyOn(lumine.workspace, "getActivePaneItem").and.returnValue(null);
      spyOn(lumine.notifications, "addWarning");

      main.runForEvent({ target: lumine.workspace.getElement() }, "showInFolder");

      expect(lumine.notifications.addWarning).not.toHaveBeenCalled();
    });
  });

  describe("acting on a path that is not there", () => {
    const path = require("path");
    const missing = path.join(__dirname, "renamed-or-deleted-since.txt");
    let main, warnings, subscription;

    beforeEach(async () => {
      const pack = await lumine.packages.activatePackage("open-external");
      main = pack.mainModule;
      warnings = [];
      // Disposed below: the callback reads `warnings` when it fires, so one
      // left attached would keep filling the next spec's array as well as
      // this one's, and every count here would be one too many.
      subscription = lumine.notifications.onDidAddNotification((notification) =>
        warnings.push(notification),
      );
    });

    afterEach(async () => {
      subscription.dispose();
      await lumine.packages.deactivatePackage("open-external");
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

  describe("launching through the main process", () => {
    let main;

    beforeEach(async () => {
      main = (await lumine.packages.activatePackage("open-external")).mainModule;
    });

    afterEach(async () => {
      await lumine.packages.deactivatePackage("open-external");
    });

    it("opens the path through the editor's shell service", async () => {
      const open = spyOn(lumine.shell, "openPath").and.resolveTo();

      expect(await main.openExternal(__filename)).toBe("");

      expect(open).toHaveBeenCalledOnceWith(__filename);
    });

    it("retains the system's refusal when the main process cannot open the path", async () => {
      spyOn(lumine.shell, "openPath").and.rejectWith(new Error("No association"));
      const warning = spyOn(lumine.notifications, "addWarning");

      expect(await main.openExternal(__filename)).toBe("No association");

      expect(warning).toHaveBeenCalledOnceWith("Could not open the file externally", {
        detail: `${__filename}\n\nNo association`,
      });
    });

    it("reveals the path through the editor's shell service", async () => {
      const show = spyOn(lumine.shell, "showItemInFolder").and.resolveTo();

      expect(await main.showInFolder(__filename)).toBe("");

      expect(show).toHaveBeenCalledOnceWith(__filename);
    });
  });

  describe("revealing the file a tab names", () => {
    let tab;

    beforeEach(async () => {
      await lumine.packages.activatePackage("open-external");
      jasmine.attachToDOM(lumine.workspace.getElement());

      // A tab of the real shape rather than the `tabs` package's: this is here
      // to pin the selector, and the package under test must not gain a
      // dependency to say so. It stays out of the document, because both
      // lookups below only walk parents and match selectors, while an attached
      // `lumine-pane` would run a connected callback with no model behind it.
      const pane = document.createElement("lumine-pane");
      pane.setAttribute("data-active-item-path", __filename);
      tab = document.createElement("li");
      tab.classList.add("tab", "active");
      pane.appendChild(tab);
    });

    afterEach(async () => {
      await lumine.packages.deactivatePackage("open-external");
    });

    // A tab sits outside the view it names, and the application menu dispatches
    // at whatever holds focus, so neither surface can be a scope the commands
    // depend on. One workspace registration reaches every one of them.
    it("registers the commands on the workspace", () => {
      const names = lumine.commands
        .findCommands({ target: lumine.workspace.getElement() })
        .map((command) => command.name);

      expect(names).toContain("open-external:show");
      expect(names).toContain("open-external:open");
    });

    it("offers only revealing in the tab's context menu", () => {
      const labels = lumine.contextMenu
        .templateForElement(tab)
        .filter((item) => item.visible !== false)
        .map((item) => item.label);

      expect(labels).toContain("Show in Folder");
      expect(labels).not.toContain("Open Externally");
    });

    it("leaves revealing out of an editor's context menu", async () => {
      const editor = await lumine.workspace.open(__filename);
      const labels = lumine.contextMenu
        .templateForElement(lumine.views.getView(editor))
        .filter((item) => item.visible !== false)
        .map((item) => item.label);

      expect(labels).not.toContain("Show in Folder");
    });
  });
});
