describe("open-external", () => {
  it("activates and deactivates cleanly", async () => {
    await atom.packages.activatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(true);
    await atom.packages.deactivatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(false);
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

    // A tab sits outside the view it names, so neither the editor scope nor
    // the image and PDF one reaches it.
    it("registers the commands on the active tab", () => {
      const names = atom.commands.findCommands({ target: tab }).map((command) => command.name);

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
