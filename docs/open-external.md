# open-external

Opens a path in the system's default application or reveals it in the file manager, and lets a package take over either operation.

|             |                                                         |
| ----------- | ------------------------------------------------------- |
| Version     | `1.0.0`                                                 |
| Provided by | `provideOpenExternal()` returning three functions       |
| Consumed by | `consumeOpenExternal(service)` returning a `Disposable` |
| Owner       | `open-external`                                         |

Two audiences share one service. Most consumers only call `openExternal` or `showInFolder`; a package that integrates a specific file manager registers a handler instead and intercepts everyone else's calls.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "open-external": {
      "versions": { "^1.0.0": "consumeOpenExternal" }
    }
  }
}
```

## Contract

```ts
type OpenExternal = {
  openExternal(filePath: string): Promise<string | undefined>;
  showInFolder(filePath: string): Promise<string | undefined>;
  registerHandler(handler: Handler): Disposable;
};

type Handler = {
  priority: number;
  openExternal?(filePath: string): unknown;
  showInFolder?(filePath: string): unknown;
};
```

| Member                     | Description                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `openExternal(filePath)`   | Opens the path with whatever the platform associates with it. Warns if it is gone.            |
| `showInFolder(filePath)`   | Reveals the path in the file manager, selecting it. Warns if it is gone.                      |
| `registerHandler(handler)` | Inserts a handler into the priority-ordered chain and returns a `Disposable` that removes it. |

A handler must have a **finite `priority`** and at least one of the two operations; anything else throws a `TypeError` at registration. Higher priority is consulted first.

## Minimal example

Calling the service:

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeOpenExternal(service) {
    this.openExternal = service;
    return new Disposable(() => (this.openExternal = null));
  },

  revealActiveFile() {
    const filePath = lumine.workspace.getActiveTextEditor()?.getPath();
    if (filePath) this.openExternal.showInFolder(filePath);
  },
};
```

Taking over an operation:

```js
consumeOpenExternal(service) {
  return service.registerHandler({
    priority: 100,
    showInFolder: (filePath) => {
      if (!this.fileManagerIsInstalled()) return;
      return lumine.shell.openApplication(this.fileManagerPath, [filePath]);
    },
  });
}
```

## Behavior

Handlers form a chain ordered by descending priority. A handler claims the call by returning a value other than `null` or `undefined`; returning either of those — or not implementing that operation at all — passes it to the next one. A returned promise is awaited before its result is checked. The built-in platform behavior is the end of the chain, so declining always ends somewhere sensible.

Use `lumine.shell.openApplication(executablePath, args, { cwd })` when a handler launches a specific application. It starts the executable directly from the main process, passes arguments literally without a shell, and resolves to its process ID after startup. This gives Windows a direct launch from the process that owns the editor window; activation remains subject to the operating system and the application. The default open and reveal operations also run through the editor's main-process shell service.

Register a handler only when it can actually do the job. A handler that claims `showInFolder` and then fails silently leaves the user with nothing, because the platform fallback was skipped.

Both operations take a path rather than a URI. Once the chain has declined, the path is checked against the filesystem before the platform is asked, and a path that is no longer there raises a warning notification instead. That check comes **after** the handlers, so a handler serving paths that were never on this filesystem is unaffected by it.

## Teardown

Each request snapshots the registered priority order. Handlers added while it waits enter the next request, and a handler removed before its turn is skipped. A non-null result from a handler already invoked still counts as handled after that registration retires, since its external action may already have happened. Deactivation stops remaining handlers and platform fallback; errors from retired handlers or path checks are ignored.

`registerHandler` returns a `Disposable` that removes the handler from the chain; return it directly from `consumeOpenExternal` when the handler is all you registered. A consumer that only calls the service should still return a `Disposable` that drops its reference.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
