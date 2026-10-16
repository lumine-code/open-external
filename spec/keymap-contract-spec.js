describe("open-external standard Enter shortcuts", () => {
  let main, editor, surfaces, selection;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("open-external")).mainModule;
    editor = await lumine.workspace.open(__filename, { opener: "text-editor" });
    selection = main.consumeTreeViewSelection({
      selectedPaths: () => [__filename],
      getSelectionSnapshot: () => ({ count: 1 }),
    });
    surfaces = ["tree-view", "image-editor", "pdf-view"].map((className) => {
      const root = document.createElement("div");
      root.className = className;
      const child = document.createElement("span");
      root.appendChild(child);
      lumine.workspace.getElement().appendChild(root);
      return { root, child };
    });
    spyOn(main, "openExternal").and.resolveTo("");
    spyOn(main, "showInFolder").and.resolveTo("");
  });

  afterEach(async () => {
    selection.dispose();
    for (const { root } of surfaces) root.remove();
    editor.destroy();
    await lumine.packages.deactivatePackage("open-external");
  });

  function press(target, modifiers) {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    Object.defineProperty(event, "target", { value: target });
    lumine.keymaps.handleKeyboardEvent(event);
  }

  for (const [label, index] of [
    ["tree view", 0],
    ["image editor", 1],
    ["PDF view", 2],
    ["text editor", 3],
  ]) {
    it(`dispatches the two Enter variants once on the ${label} without F12 aliases`, async () => {
      const target = index === 3 ? editor.getElement() : surfaces[index].child;
      const originalText = editor.getText();
      for (const [keystrokes, command] of [
        ["ctrl-alt-enter", "open-external:open"],
        ["alt-shift-enter", "open-external:show"],
      ]) {
        expect(lumine.keymaps.findKeyBindings({ target, keystrokes })[0]?.command).toBe(command);
      }
      for (const keystrokes of ["alt-f12", "ctrl-f12", "ctrl-shift-enter"]) {
        expect(
          lumine.keymaps
            .findKeyBindings({ target, keystrokes })
            .some((binding) => binding.command.startsWith("open-external:")),
        ).toBe(false);
      }

      press(target, { altKey: true });
      await flushMicrotasks();
      expect(main.openExternal).toHaveBeenCalledOnceWith(__filename);
      expect(main.showInFolder).not.toHaveBeenCalled();
      press(target, { ctrlKey: false, altKey: true, shiftKey: true });
      await flushMicrotasks();
      expect(main.showInFolder).toHaveBeenCalledOnceWith(__filename);
      expect(main.openExternal).toHaveBeenCalledTimes(1);
      expect(editor.getText()).toBe(originalText);
    });
  }
});
