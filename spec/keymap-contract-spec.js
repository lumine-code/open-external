describe("open-external surface shortcuts", () => {
  let main, editor, treeView, selection, items, panels;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("open-external")).mainModule;
    editor = await lumine.workspace.open(__filename, { opener: "text-editor" });
    selection = main.consumeTreeViewSelection({
      selectedPaths: () => [__filename],
      getSelectionSnapshot: () => ({ count: 1 }),
    });
    treeView = document.createElement("div");
    treeView.className = "tree-view";
    treeView.appendChild(document.createElement("span"));
    lumine.workspace.getElement().appendChild(treeView);
    items = [];
    panels = [];
    spyOn(main, "openExternal").and.resolveTo("");
    spyOn(main, "showInFolder").and.resolveTo("");
  });

  afterEach(async () => {
    selection.dispose();
    for (const panel of panels) panel.destroy();
    for (const item of items) {
      const pane = lumine.workspace.paneForItem(item);
      if (pane) await pane.destroyItem(item, true);
    }
    treeView.remove();
    editor.destroy();
    await lumine.packages.deactivatePackage("open-external");
  });

  function createItem(className, filePath = __filename, locations = ["center"]) {
    const item = document.createElement("div");
    item.className = className;
    item.tabIndex = 0;
    item.getPath = () => filePath;
    item.getTitle = () => className;
    item.getAllowedLocations = () => locations;
    item.canCopy = () => false;
    item.appendChild(document.createElement("span"));
    items.push(item);
    return item;
  }

  function press(target, key, modifiers) {
    const event = new KeyboardEvent("keydown", {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    Object.defineProperty(event, "target", { value: target });
    lumine.keymaps.handleKeyboardEvent(event);
  }

  function expectUnbound(target, keystrokes) {
    for (const keystroke of keystrokes) {
      expect(
        lumine.keymaps
          .findKeyBindings({ target, keystrokes: keystroke })
          .some((binding) => binding.command.startsWith("open-external:")),
      ).toBe(false);
    }
  }

  async function expectActions(target, filePath, key, openModifiers, showModifiers) {
    press(target, key, openModifiers);
    await flushMicrotasks();
    expect(main.openExternal).toHaveBeenCalledOnceWith(filePath);
    expect(main.showInFolder).not.toHaveBeenCalled();
    press(target, key, showModifiers);
    await flushMicrotasks();
    expect(main.showInFolder).toHaveBeenCalledOnceWith(filePath);
    expect(main.openExternal).toHaveBeenCalledTimes(1);
  }

  for (const [label, className] of [
    ["text editor", null],
    ["image editor", "image-editor"],
    ["PDF view", "pdf-view"],
    ["generic pane item", "generic-pane-item"],
  ]) {
    it(`dispatches the two F12 shortcuts once on the center ${label}`, async () => {
      let target = editor.getElement();
      if (className) {
        const item = createItem(className);
        lumine.workspace.getActivePane().activateItem(item);
        target = item.firstChild;
      }
      const originalText = editor.getText();
      for (const [keystrokes, command] of [
        ["alt-f12", "open-external:open"],
        ["ctrl-f12", "open-external:show"],
      ]) {
        expect(lumine.keymaps.findKeyBindings({ target, keystrokes })[0]?.command).toBe(command);
      }
      expectUnbound(target, ["ctrl-alt-enter", "alt-shift-enter", "ctrl-shift-enter"]);

      await expectActions(target, __filename, "F12", { altKey: true }, { ctrlKey: true });
      expect(editor.getText()).toBe(originalText);
    });
  }

  it("keeps the Enter shortcuts on the tree view without adding the F12 shortcuts", async () => {
    const target = treeView.firstChild;
    for (const [keystrokes, command] of [
      ["ctrl-alt-enter", "open-external:open"],
      ["alt-shift-enter", "open-external:show"],
    ]) {
      expect(lumine.keymaps.findKeyBindings({ target, keystrokes })[0]?.command).toBe(command);
    }
    expectUnbound(target, ["alt-f12", "ctrl-f12", "ctrl-shift-enter"]);
    await expectActions(
      target,
      __filename,
      "Enter",
      { ctrlKey: true, altKey: true },
      { altKey: true, shiftKey: true },
    );
  });

  it("uses the targeted center split item even while another pane is active", async () => {
    const activePane = lumine.workspace.getActivePane();
    const filePath = require.resolve("../package.json");
    const item = createItem("generic-pane-item", filePath);
    const otherPane = activePane.splitRight({ items: [item], activate: false });

    expect(lumine.workspace.getActivePane()).toBe(activePane);
    expect(lumine.workspace.getActivePaneItem()).toBe(editor);
    expect(otherPane.getActiveItem()).toBe(item);
    await expectActions(item.firstChild, filePath, "F12", { altKey: true }, { ctrlKey: true });
  });

  it("does not bind F12 outside the center panes", async () => {
    const dock = lumine.workspace.getRightDock();
    const dockItem = createItem("image-editor", __filename, ["right"]);
    dock.getActivePane().activateItem(dockItem);
    dock.show();
    const modalItem = createItem("pdf-view");
    panels.push(lumine.workspace.addModalPanel({ item: modalItem }));

    for (const target of [dockItem.firstChild, modalItem.firstChild]) {
      expectUnbound(target, ["alt-f12", "ctrl-f12", "ctrl-alt-enter", "alt-shift-enter"]);
      press(target, "F12", { altKey: true });
      press(target, "F12", { ctrlKey: true });
    }
    await flushMicrotasks();
    expect(main.openExternal).not.toHaveBeenCalled();
    expect(main.showInFolder).not.toHaveBeenCalled();
  });
});
