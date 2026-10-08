const fs = require("fs/promises");
const path = require("path");
const { CompositeDisposable, Disposable } = require("lumine");

const PACKAGE_NAME = "open-external";

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "open-external",
      tips: [
        "You can open the current file in the application your system associates with it using {{ 'open-external:open' | keystroke }}",
        "You can reveal the current file in your system file manager with {{ 'open-external:show' | keystroke }}",
      ],
    };
  },

  activate() {
    this.handlers = [];
    this.treeView = null;
    this.disposables = new CompositeDisposable(
      lumine.commands.add("lumine-workspace", {
        "open-external:toggle": () => this.toggle(),
        "open-external:open": {
          description: "Open the selected file in its default external program.",
          didDispatch: (event) => this.runForEvent(event, "openExternal"),
        },
        "open-external:show": {
          description: "Show the selected file in the system file manager.",
          didDispatch: (event) => this.runForEvent(event, "showInFolder"),
        },
      }),
      lumine.config.observe(`${PACKAGE_NAME}.flag`, (enabled) => {
        this.enabled = enabled;
      }),
      lumine.config.observe(`${PACKAGE_NAME}.list`, (extensions) => {
        this.extensions = new Set(
          (Array.isArray(extensions) ? extensions : [])
            .map((extension) => String(extension).replace(/^\./, "").toLowerCase())
            .filter(Boolean),
        );
      }),
      lumine.workspace.addOpener((uri) => {
        if (this.shouldOpenExternally(uri)) return this.openExternal(uri);
      }),
    );
  },

  deactivate() {
    const owner = this.disposables;
    this.disposables = null;
    for (const record of this.handlers) record.active = false;
    this.handlers = [];
    this.treeView = null;
    owner?.dispose();
  },

  shouldOpenExternally(uri) {
    if (!this.enabled || typeof uri !== "string") return false;
    const extension = path.extname(uri).slice(1).toLowerCase();
    return extension !== "" && this.extensions.has(extension);
  },

  toggle() {
    const enabled = !lumine.config.get(`${PACKAGE_NAME}.flag`);
    lumine.config.set(`${PACKAGE_NAME}.flag`, enabled);
    lumine.notifications.addHint(
      `External file opening has been ${enabled ? "enabled" : "disabled"}`,
    );
  },

  provideOpenExternal() {
    return {
      registerHandler: (handler) => this.registerHandler(handler),
      openExternal: (filePath) => this.openExternal(filePath),
      showInFolder: (filePath) => this.showInFolder(filePath),
    };
  },

  registerHandler(handler) {
    const owner = this.disposables;
    if (!this.isActive(owner)) return new Disposable();
    const hasOperation =
      typeof handler?.openExternal === "function" || typeof handler?.showInFolder === "function";
    if (
      !hasOperation ||
      typeof handler.priority !== "number" ||
      !Number.isFinite(handler.priority)
    ) {
      throw new TypeError(
        "An external handler must have a finite priority and at least one operation",
      );
    }

    if (!this.isActive(owner)) return new Disposable();
    const handlers = this.handlers;
    const record = { handler, active: true };
    const index = handlers.findIndex((current) => handler.priority > current.handler.priority);
    handlers.splice(index === -1 ? handlers.length : index, 0, record);

    const lease = new Disposable(() => {
      record.active = false;
      const handlerIndex = handlers.indexOf(record);
      if (handlerIndex !== -1) handlers.splice(handlerIndex, 1);
      owner.remove(lease);
    });
    owner.add(lease);
    return lease;
  },

  isActive(owner) {
    return Boolean(owner && !owner.disposed && this.disposables === owner);
  },

  async runHandlers(operation, filePath, owner = this.disposables) {
    for (const record of this.handlers.slice()) {
      if (!this.isActive(owner)) return false;
      if (!record.active) continue;
      const { handler } = record;
      const callback = handler[operation];
      if (typeof callback !== "function") continue;
      if (!this.isActive(owner)) return false;
      if (!record.active) continue;
      try {
        const handled = await callback.call(handler, filePath);
        if (!this.isActive(owner)) return false;
        // The callback may already have opened the application before its
        // registration retired. A non-null completion must not launch twice.
        if (handled != null) return true;
      } catch (error) {
        if (!this.isActive(owner)) return false;
        if (!record.active) continue;
        console.error(`Error in open-external ${operation} handler:`, error);
      }
    }
    return false;
  },

  async openExternal(filePath) {
    const owner = this.disposables;
    if (!this.isActive(owner)) return "";
    if (typeof filePath !== "string" || filePath.length === 0) return;
    if (await this.runHandlers("openExternal", filePath, owner)) return "";
    if (!this.isActive(owner)) return "";
    if (!(await this.confirmOnDisk(filePath, "open", owner))) return "";
    if (!this.isActive(owner)) return "";

    const failure = await lumine.shell.openPath(filePath);
    // `shell.openPath` reports a refusal by resolving to the reason rather
    // than by throwing, so a file the platform associates with nothing looks
    // exactly like a success from here unless the message is read.
    if (failure && this.isActive(owner)) {
      lumine.notifications.addWarning("Nothing on this system opens that file", {
        detail: `${filePath}\n\n${failure}`,
      });
    }
    return failure;
  },

  async showInFolder(filePath) {
    const owner = this.disposables;
    if (!this.isActive(owner)) return "";
    if (typeof filePath !== "string" || filePath.length === 0) return;
    if (await this.runHandlers("showInFolder", filePath, owner)) return "";
    if (!this.isActive(owner)) return "";
    if (!(await this.confirmOnDisk(filePath, "show", owner))) return "";
    if (!this.isActive(owner)) return "";

    await lumine.shell.showItemInFolder(filePath);
    return "";
  },

  // A path that has been renamed or deleted since the editor last looked is
  // the common way either operation fails, and neither says so: the reveal
  // returns nothing at all, and the open resolves to a message. Asked after
  // the handlers rather than before, so one serving paths that were never on
  // this filesystem still gets its turn.
  async confirmOnDisk(filePath, operation, owner = this.disposables) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      if (!this.isActive(owner)) return false;
      lumine.notifications.addWarning(
        operation === "open"
          ? "Cannot open a path that is gone"
          : "Cannot show a path that is gone",
        { detail: filePath },
      );
      return false;
    }
  },

  getActiveItemPath() {
    const item = lumine.workspace.getActivePaneItem();
    return typeof item?.getPath === "function" ? item.getPath() : undefined;
  },

  openActiveItem() {
    return this.openExternal(this.getActiveItemPath());
  },

  showActiveItem() {
    return this.showInFolder(this.getActiveItemPath());
  },

  // A right-click in the tree view means the rows the user selected. Anywhere
  // else — including the application menu, which dispatches at whatever holds
  // focus rather than at the file it is about — means the active pane item.
  pathsForEvent(event) {
    if (event?.target?.closest?.(".tree-view")) return this.getSelectedTreePaths();
    const activePath = this.getActiveItemPath();
    return typeof activePath === "string" && activePath.length > 0 ? [activePath] : [];
  },

  runForEvent(event, operation) {
    const paths = this.pathsForEvent(event);
    if (paths.length === 0) {
      lumine.notifications.addWarning("open-external: no file to act on", {
        detail: "Open a saved file, or select one in the tree view first.",
      });
      return;
    }
    return Promise.all(paths.map((filePath) => this[operation](filePath)));
  },

  consumeTreeViewSelection(treeView) {
    this.treeView = treeView;
    return new Disposable(() => {
      if (this.treeView === treeView) this.treeView = null;
    });
  },

  getSelectedTreePaths() {
    if (typeof this.treeView?.selectedPaths !== "function") return [];
    const selectedPaths = this.treeView.selectedPaths();
    return Array.isArray(selectedPaths) ? selectedPaths : [];
  },

  openTreeSelection() {
    return Promise.all(this.getSelectedTreePaths().map((filePath) => this.openExternal(filePath)));
  },

  showTreeSelection() {
    return Promise.all(this.getSelectedTreePaths().map((filePath) => this.showInFolder(filePath)));
  },
};
