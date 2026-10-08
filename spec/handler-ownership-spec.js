describe("open-external handler request ownership", () => {
  let main, service, leases, shell;
  const file = "/owned/handler-file.txt";
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  };

  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("open-external")).mainModule;
    service = main.provideOpenExternal();
    leases = [];
    shell = spyOn(lumine.shell, "openPath").and.resolveTo("");
    spyOn(main, "confirmOnDisk").and.resolveTo(true);
  });

  afterEach(() => {
    for (const lease of leases) lease.dispose();
  });

  function register(handler) {
    const lease = service.registerHandler(handler);
    leases.push(lease);
    return lease;
  }

  it("tries the remaining registered handler when the waiting first edge retires", async () => {
    const response = deferred();
    const first = register({ priority: 100, openExternal: () => response.promise });
    const next = jasmine.createSpy("next handler").and.resolveTo("");
    register({ priority: 10, openExternal: next });
    const pending = service.openExternal(file);
    first.dispose();
    response.resolve(null);
    await pending;

    expect(next).toHaveBeenCalledOnceWith(file);
    expect(shell).not.toHaveBeenCalled();
  });

  it("keeps duplicate payload registrations distinct across a waiting edge disposal", async () => {
    const response = deferred();
    const open = jasmine
      .createSpy("shared handler")
      .and.returnValues(response.promise, Promise.resolve(""));
    const handler = { priority: 100, openExternal: open };
    const first = register(handler);
    register(handler);
    const pending = service.openExternal(file);
    first.dispose();
    response.resolve(null);
    await pending;

    expect(open).toHaveBeenCalledTimes(2);
    expect(shell).not.toHaveBeenCalled();
  });

  it("keeps the original request order when a higher-priority registration arrives mid-request", async () => {
    const response = deferred();
    const first = jasmine.createSpy("first handler").and.returnValue(response.promise);
    const next = jasmine.createSpy("original next handler").and.resolveTo("");
    register({ priority: 100, openExternal: first });
    register({ priority: 10, openExternal: next });
    const pending = service.openExternal(file);
    const newest = jasmine.createSpy("new higher handler").and.resolveTo("");
    register({ priority: 200, openExternal: newest });
    response.resolve(null);
    await pending;

    expect(first).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledOnceWith(file);
    expect(newest).not.toHaveBeenCalled();
    await service.openExternal(file);
    expect(newest).toHaveBeenCalledOnceWith(file);
  });

  it("skips a handler retired before its turn and uses the normal fallback", async () => {
    const response = deferred();
    register({ priority: 100, openExternal: () => response.promise });
    const removed = jasmine.createSpy("removed handler").and.resolveTo("");
    register({ priority: 10, openExternal: removed }).dispose();
    const pending = service.openExternal(file);
    response.resolve(null);
    await pending;

    expect(removed).not.toHaveBeenCalled();
    expect(shell).toHaveBeenCalledOnceWith(file);
  });

  it("preserves an accepted completion from an already-invoked retired handler", async () => {
    const response = deferred();
    const first = register({ priority: 100, openExternal: () => response.promise });
    const next = jasmine.createSpy("must not duplicate external action").and.resolveTo("");
    register({ priority: 10, openExternal: next });
    const pending = service.openExternal(file);
    first.dispose();
    response.resolve(false); // Any non-null result means handled, including false.
    expect(await pending).toBe("");

    expect(next).not.toHaveBeenCalled();
    expect(shell).not.toHaveBeenCalled();
  });

  it("suppresses a retired handler's failure while trying the current next handler", async () => {
    const response = deferred();
    const first = register({ priority: 100, openExternal: () => response.promise });
    const next = jasmine.createSpy("current next handler").and.resolveTo("");
    register({ priority: 10, openExternal: next });
    const error = spyOn(console, "error");
    const pending = service.openExternal(file);
    first.dispose();
    response.reject(new Error("retired integration failed"));
    await pending;

    expect(error).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnceWith(file);
  });

  it("preserves logging and fallback after a current handler failure", async () => {
    const failure = new Error("current integration failed");
    register({ priority: 100, openExternal: () => Promise.reject(failure) });
    const error = spyOn(console, "error");
    await service.openExternal(file);

    expect(error).toHaveBeenCalledOnceWith("Error in open-external openExternal handler:", failure);
    expect(shell).toHaveBeenCalledOnceWith(file);
  });

  it("does not invoke old handlers or platform fallback after package deactivation", async () => {
    const response = deferred();
    register({ priority: 100, openExternal: () => response.promise });
    const oldNext = jasmine.createSpy("old next handler").and.resolveTo("");
    register({ priority: 10, openExternal: oldNext });
    const pending = service.openExternal(file);
    await lumine.packages.deactivatePackage("open-external");
    response.resolve(null);
    await pending;

    expect(oldNext).not.toHaveBeenCalled();
    expect(shell).not.toHaveBeenCalled();
  });

  it("does not report a disk-check failure from a retired request", async () => {
    const disk = deferred();
    main.confirmOnDisk.and.callThrough();
    spyOn(require("node:fs/promises"), "access").and.returnValue(disk.promise);
    const warning = spyOn(lumine.notifications, "addWarning");
    const pending = service.openExternal(file);
    await flushMicrotasks();
    await lumine.packages.deactivatePackage("open-external");
    disk.reject(new Error("retired path lookup"));
    await pending;

    expect(warning).not.toHaveBeenCalled();
    expect(shell).not.toHaveBeenCalled();
  });

  for (const operation of ["openExternal", "showInFolder"]) {
    it(`does not continue ${operation} after a disk check outlives deactivation`, async () => {
      const disk = deferred();
      main.confirmOnDisk.and.returnValue(disk.promise);
      const show = spyOn(lumine.shell, "showItemInFolder").and.resolveTo();
      const pending = service[operation](file);
      await flushMicrotasks();
      await lumine.packages.deactivatePackage("open-external");
      disk.resolve(true);
      await pending;

      expect(shell).not.toHaveBeenCalled();
      expect(show).not.toHaveBeenCalled();
    });
  }
});
