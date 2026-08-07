# open-external

Open files and directories with their system applications.

## Features

- **External opening**: opens active files and tree-view selections in their default system applications.
- **File manager integration**: reveals active files, tabs, and tree-view selections in the system file manager.
- **Automatic redirection**: opens files with configured extensions outside Lumine.
- **Custom handlers**: lets other packages intercept external file operations.
- **Honest failures**: says so when a path has gone from disk, or when the system opens nothing.

## Installation

To install `open-external` search for _open-external_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/open-external`.

## Commands

Commands available in `atom-workspace`:

- `open-external:toggle`: toggle automatic external opening,
- `open-external:open`: open externally,
- `open-external:show`: reveal in the system file manager.

`open-external:open` and `open-external:show` act on the tree view's selection
when they come from the tree view, and on the active file everywhere else.

## Usage

The provided service exposes `openExternal(filePath)`, `showInFolder(filePath)`, and
`registerHandler(handler)`. A custom handler must define a finite numeric `priority` and at least
one operation. Higher-priority handlers run first; returning `null` or `undefined` passes the
operation to the next handler.

## Services

- **[open-external](docs/open-external.md)** (`1.0.0`): provided to open or reveal paths and register custom handlers for those operations.
- **tree-view.selection** (`^1.0.0`): consumed to access the paths currently selected in the tree view.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
